import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
}));

vi.mock("@/lib/xero/client", () => ({
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

import { xeroTenantInitialSyncInternals } from "./xero-tenant-initial-sync";

const connection = {
  id: "11111111-1111-1111-1111-111111111111",
  platform_tenant_id: "22222222-2222-2222-2222-222222222222",
  xero_tenant_id: "tenant-123",
  status: "active" as const,
};

describe("xeroTenantInitialSync internals", () => {
  it("maps chart of accounts rows and parses Xero date formats", () => {
    const mapped = xeroTenantInitialSyncInternals.mapAccount(
      {
        AccountID: "acc-1",
        Name: "Consulting Revenue",
        Type: "REVENUE",
        Class: "REVENUE",
        UpdatedDateUTC: "/Date(1716595200000+0000)/",
      },
      connection,
    );

    expect(mapped).toMatchObject({
      platform_tenant_id: connection.platform_tenant_id,
      xero_tenant_id: connection.xero_tenant_id,
      xero_account_id: "acc-1",
      name: "Consulting Revenue",
      type: "REVENUE",
      class: "REVENUE",
    });
    expect(mapped?.updated_xero_at).toBe("2024-05-25T00:00:00.000Z");
  });

  it("converts bank transaction amounts to cents and extracts date", () => {
    const mapped = xeroTenantInitialSyncInternals.mapBankTransaction(
      {
        BankTransactionID: "tx-1",
        Type: "SPEND",
        Status: "AUTHORISED",
        IsReconciled: false,
        Date: "2026-05-25T11:15:00.000",
        Narration: "Office supplies",
        BankAccount: {
          AccountID: "bank-account-1",
        },
        Contact: {
          ContactID: "contact-1",
        },
        Total: 12.34,
        TotalTax: 1.23,
        SubTotal: 11.11,
      },
      connection,
      {
        accountsByXeroId: new Map([["bank-account-1", "33333333-3333-3333-3333-333333333333"]]),
        contactsByXeroId: new Map([["contact-1", "44444444-4444-4444-4444-444444444444"]]),
      },
    );

    expect(mapped).toMatchObject({
      xero_transaction_id: "tx-1",
      bank_account_id: "33333333-3333-3333-3333-333333333333",
      contact_id: "44444444-4444-4444-4444-444444444444",
      type: "SPEND",
      status: "AUTHORISED",
      date: "2026-05-25",
      description: "Office supplies",
      total_cents: 1234,
      tax_cents: 123,
      subtotal_cents: 1111,
    });
  });

  it("preserves user-overridden fields on existing bank transactions", () => {
    const incoming = xeroTenantInitialSyncInternals.mapBankTransaction(
      {
        BankTransactionID: "tx-override",
        Type: "RECEIVE",
        Status: "AUTHORISED",
        IsReconciled: false,
        Date: "2026-05-25",
        Reference: "xero-ref",
        Total: 50,
      },
      connection,
    );

    if (!incoming) {
      throw new Error("Expected mapped bank transaction");
    }

    const merged = xeroTenantInitialSyncInternals.mergeBankTransactionRow(incoming, {
      id: "tx-row",
      platform_tenant_id: connection.platform_tenant_id,
      xero_tenant_id: connection.xero_tenant_id,
      xero_transaction_id: "tx-override",
      bank_account_id: "33333333-3333-3333-3333-333333333333",
      type: "SPEND",
      status: "AUTHORISED",
      is_reconciled: true,
      contact_id: "44444444-4444-4444-4444-444444444444",
      date: "2026-05-24",
      description: "edited description",
      reference: "edited-ref",
      currency: "AUD",
      total_cents: 9999,
      tax_cents: 123,
      subtotal_cents: 9876,
      user_overridden_at: "2026-05-25T00:00:00.000Z",
      user_override_json: { source: "user" },
      raw_json: {},
      updated_xero_at: "2026-05-25T01:00:00.000Z",
      synced_at: "2026-05-25T01:00:00.000Z",
    });

    expect(merged).toMatchObject({
      bank_account_id: "33333333-3333-3333-3333-333333333333",
      type: "SPEND",
      is_reconciled: true,
      reference: "edited-ref",
      total_cents: 9999,
      user_overridden_at: "2026-05-25T00:00:00.000Z",
    });
    expect(merged.raw_json).toEqual(incoming.raw_json);
  });
});
