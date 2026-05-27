import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiCalls: [] as Array<Record<string, unknown>>,
  getAccessToken: vi.fn(async () => "access-token"),
  connection: {
    platform_tenant_id: "22222222-2222-2222-2222-222222222222",
    xero_tenant_id: "xero-tenant-1",
  },
}));

const supabase = {
  from: vi.fn((table: string) => {
    if (table === "xero_connections") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { ...mocks.connection }, error: null })),
          })),
        })),
      };
    }

    if (table === "xero_api_calls") {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          mocks.apiCalls.push(row);
          return { error: null };
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  }),
};

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => supabase,
}));

vi.mock("@/lib/xero/tokens", () => ({
  getAccessToken: mocks.getAccessToken,
}));

describe("XeroClient", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.apiCalls.length = 0;
    const { clearXeroClientCacheForTests } = await import("./client");
    clearXeroClientCacheForTests();
  });

  it("sets Xero headers, logs the call, and returns typed JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ Accounts: [{ AccountID: "account-1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const { XeroClient } = await import("./client");
    const client = new XeroClient("11111111-1111-1111-1111-111111111111");
    const response = await client.request<{ Accounts: Array<{ AccountID: string }> }>("GET", "/Accounts");

    expect(response.Accounts[0].AccountID).toBe("account-1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.xero.com/api.xro/2.0/Accounts",
      }),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "xero-tenant-id": "xero-tenant-1",
          Accept: "application/json",
        }),
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(requestInit.headers).not.toHaveProperty("Content-Type");

    await vi.waitFor(() => {
      expect(mocks.apiCalls).toHaveLength(1);
    });
    expect(mocks.apiCalls[0]).toMatchObject({
      platform_tenant_id: "22222222-2222-2222-2222-222222222222",
      xero_tenant_id: "xero-tenant-1",
      endpoint: "/Accounts",
      method: "GET",
      status: 200,
      retry_count: 0,
      error_text: null,
    });
  });

  it("throws retryable errors with Retry-After seconds for 429 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ Message: "rate limited" }, { status: 429, headers: { "Retry-After": "7" } })),
    );

    const { RetryableXeroError, XeroClient } = await import("./client");
    const client = new XeroClient("11111111-1111-1111-1111-111111111111");

    await expect(client.request("GET", "/BankTransactions")).rejects.toMatchObject({
      name: "RetryableXeroError",
      status: 429,
      retryAfterSeconds: 7,
    });
    await expect(client.request("GET", "/BankTransactions")).rejects.toBeInstanceOf(RetryableXeroError);

    await vi.waitFor(() => {
      expect(mocks.apiCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(mocks.apiCalls[0]).toMatchObject({
      endpoint: "/BankTransactions",
      status: 429,
      error_text: JSON.stringify({ Message: "rate limited" }),
    });
  });

  it("throws retryable errors for 5xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ Message: "bad gateway" }, { status: 502 })));

    const { RetryableXeroError, XeroClient } = await import("./client");
    const client = new XeroClient("11111111-1111-1111-1111-111111111111");

    await expect(client.request("GET", "/Contacts")).rejects.toBeInstanceOf(RetryableXeroError);
  });

  it("throws non-retryable errors with the response body for non-429 4xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ Message: "validation failed" }, { status: 400 })));

    const { NonRetryableXeroError, XeroClient } = await import("./client");
    const client = new XeroClient("11111111-1111-1111-1111-111111111111");

    await expect(client.request("POST", "/Invoices", { body: { Type: "ACCREC" } })).rejects.toMatchObject({
      name: "NonRetryableXeroError",
      status: 400,
      responseBody: JSON.stringify({ Message: "validation failed" }),
    });
    await expect(client.request("POST", "/Invoices", { body: { Type: "ACCREC" } })).rejects.toBeInstanceOf(
      NonRetryableXeroError,
    );
  });

  it("throws a not-modified error for 304 responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 304 })));

    const { XeroClient, XeroNotModifiedError } = await import("./client");
    const client = new XeroClient("11111111-1111-1111-1111-111111111111");

    await expect(client.listContacts({ ifModifiedSince: "2026-05-25T01:02:03.000Z" })).rejects.toBeInstanceOf(
      XeroNotModifiedError,
    );
  });

  it("formats If-Modified-Since and auto-iterates paginated responses until callback stops", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ BankTransactions: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { XeroClient, formatIfModifiedSince } = await import("./client");
    expect(formatIfModifiedSince(new Date("2026-05-25T01:02:03.000Z"))).toBe(
      "Mon, 25 May 2026 01:02:03 GMT",
    );

    const client = new XeroClient("11111111-1111-1111-1111-111111111111");
    await client.listBankTransactions({
      ifModifiedSince: new Date("2026-05-25T01:02:03.000Z"),
      page: 2,
      where: 'Status=="AUTHORISED"',
    });

    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(
      "https://api.xero.com/api.xro/2.0/BankTransactions?page=2&where=Status%3D%3D%22AUTHORISED%22",
    );
    expect(requestInit.headers).toMatchObject({
      "If-Modified-Since": "Mon, 25 May 2026 01:02:03 GMT",
    });

    await client.listAccounts({ ifModifiedSince: "2026-05-25T01:02:03.000Z" });
    await client.listTaxRates({ ifModifiedSince: "2026-05-25T01:02:03.000Z" });
    expect((fetchMock.mock.calls[1] as unknown as [URL, RequestInit])[1].headers).toMatchObject({
      "If-Modified-Since": "Mon, 25 May 2026 01:02:03 GMT",
    });
    expect((fetchMock.mock.calls[2] as unknown as [URL, RequestInit])[1].headers).toMatchObject({
      "If-Modified-Since": "Mon, 25 May 2026 01:02:03 GMT",
    });

    const pages: number[] = [];

    await client.paginate(
      async (pageNumber) => ({
        pageInfo: { totalPages: 4 },
        value: pageNumber,
      }),
      (page) => {
        pages.push(page.value);
        return page.value < 2;
      },
    );

    expect(pages).toEqual([1, 2]);
  });

  it("createContact returns the created Xero ContactID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ Contacts: [{ ContactID: "contact-1" }] })),
    );

    const { XeroClient } = await import("./client");
    const client = new XeroClient("11111111-1111-1111-1111-111111111111");

    await expect(client.createContact({ Contacts: [{ Name: "Ada Co" }] })).resolves.toBe("contact-1");
  });
});

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
