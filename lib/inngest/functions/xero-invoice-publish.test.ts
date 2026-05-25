import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
}));

vi.mock("@/lib/xero/client", () => ({
  NonRetryableXeroError: class NonRetryableXeroError extends Error {
    constructor(
      message: string,
      public status: number,
      public responseBody: string,
    ) {
      super(message);
    }
  },
  RetryableXeroError: class RetryableXeroError extends Error {},
  XeroClient: class XeroClient {},
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (...args: unknown[]) => {
      void args;
      return { mocked: true };
    },
  },
}));

import { xeroInvoicePublishInternals } from "./xero-invoice-publish";

describe("xeroInvoicePublish internals", () => {
  it("builds ACCREC payload using line item snapshot and local mappings", () => {
    const payload = xeroInvoicePublishInternals.buildXeroPayload({
      invoice: {
        id: "invoice-1",
        platform_tenant_id: "tenant-1",
        xero_tenant_id: "xero-tenant-1",
        type: "ACCREC",
        status: "publishing",
        xero_invoice_id: null,
        xero_invoice_number: null,
        contact_id: "contact-1",
        date: "2026-05-25",
        due_date: "2026-06-08",
        reference: "INV-REF-1",
        line_items_json: [
          {
            description: "Bookkeeping retainer",
            quantity: 1,
            unit_amount_cents: 12500,
            account_id: "account-1",
            tax_rate_id: "tax-1",
          },
        ],
        subtotal_cents: 12500,
        tax_cents: 1250,
        total_cents: 13750,
        currency: null,
        attachment_path: null,
        attachment_status: null,
        publish_error: null,
        published_to_xero_at: null,
        created_by: null,
        created_at: "2026-05-25T00:00:00.000Z",
      },
      connection: { id: "connection-1", xero_tenant_id: "xero-tenant-1" },
      contact: { xero_contact_id: "xero-contact-1" },
      accounts: [{ id: "account-1", code: "200" }],
      taxRates: [{ id: "tax-1", xero_tax_type: "OUTPUT2" }],
    });

    expect(payload).toEqual({
      Invoices: [
        {
          Type: "ACCREC",
          Status: "DRAFT",
          Date: "2026-05-25",
          DueDate: "2026-06-08",
          Reference: "INV-REF-1",
          Contact: {
            ContactID: "xero-contact-1",
          },
          LineItems: [
            {
              Description: "Bookkeeping retainer",
              Quantity: 1,
              UnitAmount: 125,
              AccountCode: "200",
              TaxType: "OUTPUT2",
            },
          ],
        },
      ],
    });
  });

  it("extracts InvoiceID from Xero publish response", () => {
    const parsed = xeroInvoicePublishInternals.extractPublishedInvoice({
      Invoices: [{ InvoiceID: "xero-invoice-1", InvoiceNumber: "INV-0012" }],
    });

    expect(parsed).toEqual({ InvoiceID: "xero-invoice-1", InvoiceNumber: "INV-0012" });
  });
});
