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

import { xeroBillPublishInternals } from "./xero-bill-publish";

describe("xeroBillPublish internals", () => {
  it("builds ACCPAY payload using line item snapshot and local mappings", () => {
    const payload = xeroBillPublishInternals.buildXeroPayload({
      bill: {
        id: "bill-1",
        platform_tenant_id: "tenant-1",
        xero_tenant_id: "xero-tenant-1",
        type: "ACCPAY",
        status: "publishing",
        xero_invoice_id: null,
        xero_invoice_number: null,
        contact_id: "contact-1",
        date: "2026-05-25",
        due_date: "2026-06-08",
        reference: "BILL-REF-1",
        line_items_json: [
          {
            description: "Hosting",
            quantity: 1,
            unit_amount_cents: 3999,
            account_id: "account-1",
            tax_rate_id: "tax-1",
          },
        ],
        subtotal_cents: 3999,
        tax_cents: 400,
        total_cents: 4399,
        currency: null,
        attachment_path: "tenant/t1/bills/b1/receipt.pdf",
        attachment_status: "pending",
        publish_error: null,
        published_to_xero_at: null,
        created_by: null,
        created_at: "2026-05-25T00:00:00.000Z",
      },
      connection: { id: "connection-1", xero_tenant_id: "xero-tenant-1" },
      contact: { xero_contact_id: "xero-contact-1" },
      accounts: [{ id: "account-1", code: "400" }],
      taxRates: [{ id: "tax-1", xero_tax_type: "INPUT2" }],
    });

    expect(payload).toEqual({
      Invoices: [
        {
          Type: "ACCPAY",
          Status: "DRAFT",
          Date: "2026-05-25",
          DueDate: "2026-06-08",
          Reference: "BILL-REF-1",
          Contact: {
            ContactID: "xero-contact-1",
          },
          LineItems: [
            {
              Description: "Hosting",
              Quantity: 1,
              UnitAmount: 39.99,
              AccountCode: "400",
              TaxType: "INPUT2",
            },
          ],
        },
      ],
    });
  });

  it("extracts filename from storage path", () => {
    expect(xeroBillPublishInternals.extractFilename("tenant/a/bills/c/invoice_001.pdf")).toBe("invoice_001.pdf");
  });
});

