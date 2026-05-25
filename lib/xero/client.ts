import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { XERO_CONNECTIONS_URL } from "@/lib/xero/env";
import { getAccessToken } from "@/lib/xero/tokens";

type XeroConnectionRow = Database["public"]["Tables"]["xero_connections"]["Row"];
type ConnectionContext = Pick<XeroConnectionRow, "platform_tenant_id" | "xero_tenant_id">;

export type XeroRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type XeroRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  retryCount?: number;
};

export type XeroListOptions = {
  ifModifiedSince?: Date | string;
  page?: number;
  where?: string;
};

export type XeroPaginationInfo = {
  totalPages?: number;
};

export type XeroPaginatedResponse = {
  pageInfo?: XeroPaginationInfo;
  pagination?: {
    page?: number;
    pageCount?: number;
  };
};

export type XeroPageCallback<T> = (page: T, pageNumber: number) => boolean | void | Promise<boolean | void>;

const ACCOUNTING_API_BASE_URL = "https://api.xero.com/api.xro/2.0";
const WRITE_METHODS = new Set<XeroRequestMethod>(["POST", "PUT", "PATCH"]);
const connectionContextCache = new Map<string, ConnectionContext>();

export class RetryableXeroError extends Error {
  readonly retryable = true;

  constructor(
    message: string,
    readonly status: number | null,
    readonly retryAfterSeconds?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "RetryableXeroError";
  }
}

export class NonRetryableXeroError extends Error {
  readonly retryable = false;

  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = "NonRetryableXeroError";
  }
}

export class XeroClient {
  constructor(private readonly connectionId: string) {
    if (!connectionId) {
      throw new Error("connectionId must be a non-empty string");
    }
  }

  async request<T>(
    method: XeroRequestMethod,
    path: string,
    options: XeroRequestOptions = {},
  ): Promise<T> {
    const context = await getConnectionContext(this.connectionId);
    const accessToken = await getAccessToken(this.connectionId);
    const url = buildAccountingApiUrl(path, options.query);
    const startedAt = Date.now();
    let status: number | null = null;
    let errorText: string | null = null;

    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders(method, accessToken, context.xero_tenant_id, options.headers),
        body: buildBody(options.body),
      });
      status = response.status;

      if (!response.ok) {
        errorText = await safeText(response);
        throw errorForResponse(response, errorText);
      }

      return (await parseResponse<T>(response)) as T;
    } catch (error) {
      if (error instanceof RetryableXeroError || error instanceof NonRetryableXeroError) {
        throw error;
      }

      errorText = error instanceof Error ? error.message : String(error);
      throw new RetryableXeroError(`Xero request failed before a response: ${errorText}`, null);
    } finally {
      logApiCall({
        context,
        endpoint: path,
        method,
        status,
        durationMs: Date.now() - startedAt,
        retryCount: options.retryCount ?? 0,
        errorText,
      });
    }
  }

  listBankTransactions(options: XeroListOptions = {}) {
    return this.request("GET", "/BankTransactions", {
      headers: ifModifiedSinceHeader(options.ifModifiedSince),
      query: listQuery(options),
    });
  }

  listAccounts(options: Pick<XeroListOptions, "where"> = {}) {
    return this.request("GET", "/Accounts", { query: listQuery(options) });
  }

  listContacts(options: Omit<XeroListOptions, "where"> = {}) {
    return this.request("GET", "/Contacts", {
      headers: ifModifiedSinceHeader(options.ifModifiedSince),
      query: listQuery(options),
    });
  }

  listTaxRates() {
    return this.request("GET", "/TaxRates");
  }

  async listConnections<T = unknown>(): Promise<T> {
    const context = await getConnectionContext(this.connectionId);
    const accessToken = await getAccessToken(this.connectionId);
    const startedAt = Date.now();
    let status: number | null = null;
    let errorText: string | null = null;

    try {
      const response = await fetch(XERO_CONNECTIONS_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      status = response.status;

      if (!response.ok) {
        errorText = await safeText(response);
        throw errorForResponse(response, errorText);
      }

      return (await parseResponse<T>(response)) as T;
    } catch (error) {
      if (error instanceof RetryableXeroError || error instanceof NonRetryableXeroError) {
        throw error;
      }

      errorText = error instanceof Error ? error.message : String(error);
      throw new RetryableXeroError(`Xero connections request failed before a response: ${errorText}`, null);
    } finally {
      logApiCall({
        context,
        endpoint: "/connections",
        method: "GET",
        status,
        durationMs: Date.now() - startedAt,
        retryCount: 0,
        errorText,
      });
    }
  }

  createInvoice(payload: XeroInvoicePayload) {
    return this.request("POST", "/Invoices", { body: withInvoiceType(payload, "ACCREC") });
  }

  createBill(payload: XeroInvoicePayload) {
    return this.request("POST", "/Invoices", { body: withInvoiceType(payload, "ACCPAY") });
  }

  async createContact(payload: unknown): Promise<string> {
    const contact = await this.createContactRecord(payload);
    return contact.ContactID;
  }

  async createContactRecord(payload: unknown): Promise<{
    ContactID: string;
    Name: string | null;
    EmailAddress: string | null;
    IsCustomer: boolean | null;
    IsSupplier: boolean | null;
  }> {
    const response = await this.request<XeroCreateContactResponse>("POST", "/Contacts", { body: payload });
    const firstContact = response.Contacts?.[0];
    const contactId = firstContact?.ContactID;

    if (!contactId) {
      throw new NonRetryableXeroError("Xero contact creation response did not include ContactID.", 422, JSON.stringify(response));
    }

    return {
      ContactID: contactId,
      Name: firstContact?.Name ?? null,
      EmailAddress: firstContact?.EmailAddress ?? null,
      IsCustomer: firstContact?.IsCustomer ?? null,
      IsSupplier: firstContact?.IsSupplier ?? null,
    };
  }

  attachToInvoice(invoiceId: string, filename: string, contentType: string, bytes: Uint8Array | ArrayBuffer) {
    const attachmentPath = `/Invoices/${encodeURIComponent(invoiceId)}/Attachments/${encodeURIComponent(filename)}`;
    return this.request("POST", attachmentPath, {
      body: bytes,
      headers: {
        "Content-Type": contentType,
      },
    });
  }

  async paginate<T extends XeroPaginatedResponse>(
    fetchPage: (pageNumber: number) => Promise<T>,
    onPage: XeroPageCallback<T>,
    startPage = 1,
  ): Promise<void> {
    let pageNumber = startPage;

    while (true) {
      const page = await fetchPage(pageNumber);
      const shouldContinue = await onPage(page, pageNumber);

      if (shouldContinue === false) {
        return;
      }

      const totalPages = getTotalPages(page);
      if (!totalPages || pageNumber >= totalPages) {
        return;
      }

      pageNumber += 1;
    }
  }

  private buildHeaders(
    method: XeroRequestMethod,
    accessToken: string,
    xeroTenantId: string,
    extraHeaders: Record<string, string> = {},
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": xeroTenantId,
      Accept: "application/json",
      ...extraHeaders,
    };

    if (WRITE_METHODS.has(method) && !hasHeader(headers, "Content-Type")) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }
}

type XeroInvoicePayload = Record<string, unknown>;

type XeroCreateContactResponse = {
  Contacts?: Array<{
    ContactID?: string;
    Name?: string;
    EmailAddress?: string;
    IsCustomer?: boolean;
    IsSupplier?: boolean;
  }>;
};

function listQuery(options: Pick<XeroListOptions, "page" | "where">) {
  return {
    page: options.page,
    where: options.where,
  };
}

export function formatIfModifiedSince(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toUTCString();
}

function ifModifiedSinceHeader(value: Date | string | undefined) {
  return value ? { "If-Modified-Since": formatIfModifiedSince(value) } : undefined;
}

function withInvoiceType(payload: XeroInvoicePayload, type: "ACCREC" | "ACCPAY") {
  if (Array.isArray(payload.Invoices)) {
    return {
      ...payload,
      Invoices: payload.Invoices.map((invoice) =>
        isRecord(invoice) ? { ...invoice, Type: type } : invoice,
      ),
    };
  }

  return { ...payload, Type: type };
}

async function getConnectionContext(connectionId: string): Promise<ConnectionContext> {
  const cached = connectionContextCache.get(connectionId);
  if (cached) {
    return cached;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("xero_connections")
    .select("platform_tenant_id,xero_tenant_id")
    .eq("id", connectionId)
    .single();

  if (error || !data) {
    throw new Error(`Xero connection ${connectionId} not found.`);
  }

  connectionContextCache.set(connectionId, data);
  return data;
}

function buildAccountingApiUrl(path: string, query?: XeroRequestOptions["query"]) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${ACCOUNTING_API_BASE_URL}${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildBody(body: unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof ReadableStream
  ) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

function errorForResponse(response: Response, body: string) {
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    return new RetryableXeroError("Xero rate limit exceeded.", response.status, retryAfterSeconds, body);
  }

  if (response.status >= 500) {
    return new RetryableXeroError(`Xero request failed with ${response.status}.`, response.status, undefined, body);
  }

  return new NonRetryableXeroError(`Xero request failed with ${response.status}.`, response.status, body);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds;
  }

  const retryAtMs = Date.parse(value);
  if (!Number.isNaN(retryAtMs)) {
    return Math.max(0, Math.ceil((retryAtMs - Date.now()) / 1000));
  }

  return undefined;
}

function getTotalPages(page: XeroPaginatedResponse): number | undefined {
  return page.pageInfo?.totalPages ?? page.pagination?.pageCount;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unavailable>";
  }
}

function logApiCall(input: {
  context: ConnectionContext;
  endpoint: string;
  method: string;
  status: number | null;
  durationMs: number;
  retryCount: number;
  errorText: string | null;
}) {
  const insertPromise = createServiceRoleClient().from("xero_api_calls").insert({
    platform_tenant_id: input.context.platform_tenant_id,
    xero_tenant_id: input.context.xero_tenant_id,
    endpoint: input.endpoint,
    method: input.method,
    status: input.status,
    duration_ms: input.durationMs,
    retry_count: input.retryCount,
    error_text: input.errorText,
  });

  void Promise.resolve(insertPromise)
    .then(({ error }) => {
      if (error) {
        console.error("[xero.client] failed to log API call", error);
      }
    })
    .catch((error: unknown) => {
      console.error("[xero.client] failed to log API call", error);
    });
}

export function clearXeroClientCacheForTests() {
  connectionContextCache.clear();
}
