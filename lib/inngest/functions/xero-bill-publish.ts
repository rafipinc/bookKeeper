import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { inngest } from "@/lib/inngest/client";
import { NonRetryableXeroError, RetryableXeroError, XeroClient } from "@/lib/xero/client";
import { centsToXeroUnitAmount } from "@/lib/xero/invoice-payload";

type XeroInvoiceRow = Database["public"]["Tables"]["xero_invoices"]["Row"];
type XeroContactRow = Database["public"]["Tables"]["xero_contacts"]["Row"];
type XeroAccountRow = Database["public"]["Tables"]["xero_accounts"]["Row"];
type XeroTaxRateRow = Database["public"]["Tables"]["xero_tax_rates"]["Row"];
type XeroConnectionRow = Database["public"]["Tables"]["xero_connections"]["Row"];

type PublishContext = {
  bill: XeroInvoiceRow;
  connection: Pick<XeroConnectionRow, "id" | "xero_tenant_id">;
  contact: Pick<XeroContactRow, "xero_contact_id"> | null;
  accounts: Array<Pick<XeroAccountRow, "id" | "code">>;
  taxRates: Array<Pick<XeroTaxRateRow, "id" | "xero_tax_type">>;
};

const BILL_ATTACHMENTS_BUCKET = process.env.BILL_ATTACHMENTS_BUCKET ?? "xero-bill-documents";

export const xeroBillPublish = inngest.createFunction(
  {
    id: "xero-bill-publish",
    retries: 5,
    concurrency: {
      key: "event.data.billId",
      limit: 1,
    },
    triggers: [{ event: "xero/bill.publish" }],
    onFailure: async ({ event }) => {
      const billId = asRecord(event.data).billId;
      if (typeof billId !== "string" || !billId) {
        return;
      }
      await markBillPublishFailed(billId, "Bill publish failed after retries.");
    },
  },
  async ({ event, step }) => {
    const billId = parseBillId(event.data);

    try {
      const context = await step.run("load bill publish context", async () => loadPublishContext(billId));
      const payload = buildXeroPayload(context);
      const xeroClient = new XeroClient(context.connection.id);
      const response = await step.run("publish draft bill to xero", async () => xeroClient.createBill(payload));
      const published = extractPublishedInvoice(response);

      await step.run("persist publish success", async () =>
        persistPublishSuccess(
          context.bill.id,
          published.InvoiceID,
          published.InvoiceNumber,
          Boolean(context.bill.attachment_path),
        ),
      );

      if (context.bill.attachment_path) {
        await step.run("upload bill attachment", async () =>
          uploadBillAttachment(context.bill, published.InvoiceID, xeroClient),
        );
      }

      return { billId: context.bill.id, xeroInvoiceId: published.InvoiceID };
    } catch (error) {
      if (error instanceof NonRetryableXeroError) {
        await step.run("persist non-retryable publish failure", async () =>
          markBillPublishFailed(billId, extractErrorMessage(error)),
        );
        return { billId, publishFailed: true };
      }

      if (error instanceof RetryableXeroError) {
        throw error;
      }

      throw error;
    }
  },
);

function parseBillId(data: unknown): string {
  const billId = asRecord(data).billId;
  if (typeof billId !== "string" || !billId) {
    throw new Error("Missing billId.");
  }
  return billId;
}

async function loadPublishContext(billId: string): Promise<PublishContext> {
  const supabase = createServiceRoleClient();

  const { data: bill, error: billError } = await supabase
    .from("xero_invoices")
    .select("*")
    .eq("id", billId)
    .eq("type", "ACCPAY")
    .single();

  if (billError || !bill) {
    throw new NonRetryableXeroError(`Bill ${billId} not found.`, 404, billError?.message ?? "");
  }

  const [{ data: connection, error: connectionError }, contactsResult, accountsResult, taxRatesResult] =
    await Promise.all([
      supabase
        .from("xero_connections")
        .select("id,xero_tenant_id")
        .eq("platform_tenant_id", bill.platform_tenant_id)
        .eq("xero_tenant_id", bill.xero_tenant_id)
        .eq("status", "active")
        .single(),
      bill.contact_id
        ? supabase
            .from("xero_contacts")
            .select("xero_contact_id")
            .eq("platform_tenant_id", bill.platform_tenant_id)
            .eq("id", bill.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("xero_accounts")
        .select("id,code")
        .eq("platform_tenant_id", bill.platform_tenant_id)
        .eq("xero_tenant_id", bill.xero_tenant_id),
      supabase
        .from("xero_tax_rates")
        .select("id,xero_tax_type")
        .eq("platform_tenant_id", bill.platform_tenant_id)
        .eq("xero_tenant_id", bill.xero_tenant_id),
    ]);

  if (connectionError || !connection) {
    throw new NonRetryableXeroError("Active Xero connection not found for bill.", 422, connectionError?.message ?? "");
  }

  if (contactsResult.error) {
    throw contactsResult.error;
  }

  if (accountsResult.error) {
    throw accountsResult.error;
  }

  if (taxRatesResult.error) {
    throw taxRatesResult.error;
  }

  return {
    bill,
    connection,
    contact: contactsResult.data,
    accounts: accountsResult.data ?? [],
    taxRates: taxRatesResult.data ?? [],
  };
}

function buildXeroPayload(context: PublishContext): Record<string, unknown> {
  const lineItemsJson = context.bill.line_items_json;
  if (!Array.isArray(lineItemsJson) || !lineItemsJson.length) {
    throw new NonRetryableXeroError("Bill has no line items.", 422, "");
  }

  const accountsById = new Map(context.accounts.map((account) => [account.id, account]));
  const taxRatesById = new Map(context.taxRates.map((taxRate) => [taxRate.id, taxRate]));
  const lineItems = lineItemsJson.map((lineItem, index) =>
    mapInvoiceLineItem(lineItem, index, accountsById, taxRatesById),
  );

  const invoicePayload: Record<string, unknown> = {
    Type: "ACCPAY",
    Status: "DRAFT",
    Date: context.bill.date,
    DueDate: context.bill.due_date,
    Reference: context.bill.reference,
    LineItems: lineItems,
  };

  if (context.contact?.xero_contact_id) {
    invoicePayload.Contact = {
      ContactID: context.contact.xero_contact_id,
    };
  }

  if (context.bill.xero_invoice_number) {
    invoicePayload.InvoiceNumber = context.bill.xero_invoice_number;
  }

  return {
    Invoices: [invoicePayload],
  };
}

function mapInvoiceLineItem(
  rawValue: unknown,
  index: number,
  accountsById: Map<string, Pick<XeroAccountRow, "id" | "code">>,
  taxRatesById: Map<string, Pick<XeroTaxRateRow, "id" | "xero_tax_type">>,
) {
  const lineItem = asRecord(rawValue);
  const description = asString(lineItem.description);
  const quantity = asNumber(lineItem.quantity);
  const unitAmountCents = asNumber(lineItem.unit_amount_cents);

  if (!description || quantity === null || unitAmountCents === null) {
    throw new NonRetryableXeroError(`Invalid line item at index ${index}.`, 422, JSON.stringify(rawValue));
  }

  const mapped: Record<string, unknown> = {
    Description: description,
    Quantity: quantity,
    UnitAmount: centsToXeroUnitAmount(unitAmountCents),
  };

  const accountCode = asString(lineItem.account_code) ?? resolveAccountCode(lineItem.account_id, accountsById);
  const taxType = asString(lineItem.tax_type) ?? resolveTaxType(lineItem.tax_rate_id, taxRatesById);

  if (accountCode) {
    mapped.AccountCode = accountCode;
  }
  if (taxType) {
    mapped.TaxType = taxType;
  }

  return mapped;
}

function resolveAccountCode(
  accountId: unknown,
  accountsById: Map<string, Pick<XeroAccountRow, "id" | "code">>,
): string | null {
  const id = asString(accountId);
  if (!id) {
    return null;
  }
  return accountsById.get(id)?.code ?? null;
}

function resolveTaxType(
  taxRateId: unknown,
  taxRatesById: Map<string, Pick<XeroTaxRateRow, "id" | "xero_tax_type">>,
): string | null {
  const id = asString(taxRateId);
  if (!id) {
    return null;
  }
  return taxRatesById.get(id)?.xero_tax_type ?? null;
}

function extractPublishedInvoice(response: unknown): { InvoiceID: string; InvoiceNumber: string | null } {
  const data = asRecord(response);
  const invoices = data.Invoices;
  if (!Array.isArray(invoices) || !invoices.length) {
    throw new NonRetryableXeroError("Xero publish response did not include invoice.", 422, JSON.stringify(response));
  }

  const firstInvoice = asRecord(invoices[0]);
  const invoiceId = asString(firstInvoice.InvoiceID);
  if (!invoiceId) {
    throw new NonRetryableXeroError("Xero publish response missing InvoiceID.", 422, JSON.stringify(response));
  }

  return {
    InvoiceID: invoiceId,
    InvoiceNumber: asString(firstInvoice.InvoiceNumber),
  };
}

async function persistPublishSuccess(
  invoiceId: string,
  xeroInvoiceId: string,
  xeroInvoiceNumber: string | null,
  hasAttachment: boolean,
) {
  const { error } = await createServiceRoleClient()
    .from("xero_invoices")
    .update({
      status: "published",
      xero_invoice_id: xeroInvoiceId,
      xero_invoice_number: xeroInvoiceNumber,
      publish_error: null,
      published_to_xero_at: new Date().toISOString(),
      attachment_status: hasAttachment ? "pending" : null,
    })
    .eq("id", invoiceId);

  if (error) {
    throw error;
  }
}

async function markBillPublishFailed(billId: string, message: string) {
  const { error } = await createServiceRoleClient()
    .from("xero_invoices")
    .update({
      status: "publish_failed",
      publish_error: message,
    })
    .eq("id", billId);

  if (error) {
    throw error;
  }
}

async function uploadBillAttachment(bill: XeroInvoiceRow, xeroInvoiceId: string, xeroClient: XeroClient) {
  if (!bill.attachment_path) {
    return;
  }

  const storage = createServiceRoleClient().storage.from(BILL_ATTACHMENTS_BUCKET);
  const { data, error } = await storage.download(bill.attachment_path);
  if (error || !data) {
    await markAttachmentStatus(bill.id, "failed");
    return;
  }

  const filename = extractFilename(bill.attachment_path);
  const contentType = data.type || "application/octet-stream";
  const bytes = new Uint8Array(await data.arrayBuffer());

  try {
    await xeroClient.attachToInvoice(xeroInvoiceId, filename, contentType, bytes);
    await markAttachmentStatus(bill.id, "uploaded");
  } catch {
    await markAttachmentStatus(bill.id, "failed");
  }
}

async function markAttachmentStatus(billId: string, status: string) {
  const { error } = await createServiceRoleClient()
    .from("xero_invoices")
    .update({ attachment_status: status })
    .eq("id", billId);

  if (error) {
    throw error;
  }
}

function extractFilename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "attachment";
}

function extractErrorMessage(error: NonRetryableXeroError): string {
  return error.responseBody || error.message;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const xeroBillPublishInternals = {
  buildXeroPayload,
  extractPublishedInvoice,
  extractFilename,
};
