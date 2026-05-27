import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    serviceRoleClient: {} as unknown,
  };

  return {
    createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
    send: vi.fn(),
    state,
  };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mocks.state.serviceRoleClient,
}));

vi.mock("@/lib/xero/client", () => ({
  RetryableXeroError: class RetryableXeroError extends Error {},
  XeroNotModifiedError: class XeroNotModifiedError extends Error {},
  XeroClient: class XeroClient {},
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: mocks.createFunction,
    send: mocks.send,
  },
}));

describe("xero tenant delta sync functions", () => {
  it("registers the 15-minute scheduler and per-connection delta worker", async () => {
    await import("./xero-tenant-delta-sync");

    expect(mocks.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "xero-tenant-delta-sync-all",
        triggers: [{ cron: "*/15 * * * *" }],
      }),
      expect.any(Function),
    );
    expect(mocks.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "xero-tenant-delta-sync",
        retries: 5,
        concurrency: {
          key: "event.data.connectionId",
          limit: 1,
        },
        triggers: [{ event: "xero/tenant.sync.delta" }],
      }),
      expect.any(Function),
    );
  });

  it("treats Xero 304 responses as no changes", async () => {
    const { XeroNotModifiedError } = await import("@/lib/xero/client");
    const { xeroTenantDeltaSyncInternals } = await import("./xero-tenant-delta-sync");

    await expect(
      xeroTenantDeltaSyncInternals.getModified(async () => {
        throw new XeroNotModifiedError();
      }),
    ).resolves.toBeNull();
  });

  it("preserves user overrides and returns inserted bank transaction ids", async () => {
    const upsertedRows: unknown[] = [];
    const connection = {
      id: "connection-1",
      platform_tenant_id: "tenant-1",
      xero_tenant_id: "xero-tenant-1",
      status: "active" as const,
      last_synced_at: "2026-05-25T00:00:00.000Z",
    };
    const existingOverride = {
      id: "existing-row",
      platform_tenant_id: connection.platform_tenant_id,
      xero_tenant_id: connection.xero_tenant_id,
      xero_transaction_id: "tx-existing",
      bank_account_id: "account-row",
      type: "SPEND",
      status: "AUTHORISED",
      is_reconciled: true,
      contact_id: "contact-row",
      date: "2026-05-24",
      description: "user edit",
      reference: "user-ref",
      currency: "AUD",
      total_cents: 9999,
      tax_cents: 999,
      subtotal_cents: 9000,
      user_overridden_at: "2026-05-25T01:00:00.000Z",
      user_override_json: { source: "user" },
      raw_json: {},
      updated_xero_at: "2026-05-25T01:00:00.000Z",
      synced_at: "2026-05-25T01:00:00.000Z",
    };

    mocks.state.serviceRoleClient = {
      from: vi.fn((table: string) => {
        if (table === "xero_accounts") {
          return selectEq([{ id: "account-row", xero_account_id: "bank-account-1" }]);
        }

        if (table === "xero_contacts") {
          return selectEq([{ id: "contact-row", xero_contact_id: "contact-1" }]);
        }

        if (table === "xero_bank_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn((_column: string, ids: string[]) => {
                    const data = ids.includes("tx-existing")
                      ? [existingOverride]
                      : [{ ...existingOverride, id: "new-row", xero_transaction_id: "tx-new" }];
                    return Promise.resolve({ data, error: null });
                  }),
                })),
              })),
            })),
            upsert: vi.fn((rows: unknown[]) => {
              upsertedRows.push(...rows);
              return {
                select: vi.fn(async () => ({ data: rows, error: null })),
              };
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const client = {
      listBankTransactions: vi.fn(async () => ({
        BankTransactions: [
          {
            BankTransactionID: "tx-existing",
            Type: "RECEIVE",
            Status: "AUTHORISED",
            IsReconciled: false,
            Date: "2026-05-26",
            Reference: "xero-ref",
            BankAccount: { AccountID: "bank-account-1" },
            Contact: { ContactID: "contact-1" },
            Total: 50,
            TotalTax: 5,
            SubTotal: 45,
            UpdatedDateUTC: "2026-05-26T00:00:00.000Z",
          },
          {
            BankTransactionID: "tx-new",
            Type: "SPEND",
            Status: "AUTHORISED",
            IsReconciled: false,
            Date: "2026-05-26",
            BankAccount: { AccountID: "bank-account-1" },
            Total: 12,
            UpdatedDateUTC: "2026-05-26T02:00:00.000Z",
          },
        ],
      })),
    };

    const { xeroTenantDeltaSyncInternals } = await import("./xero-tenant-delta-sync");
    const result = await xeroTenantDeltaSyncInternals.syncBankTransactionsDelta(
      client as never,
      connection,
      connection.last_synced_at,
    );

    expect(result).toMatchObject({
      changed: 2,
      insertedIds: ["new-row"],
      newestSeenDate: "2026-05-26T02:00:00.000Z",
    });
    expect(upsertedRows[0]).toMatchObject({
      xero_transaction_id: "tx-existing",
      type: "SPEND",
      description: "user edit",
      reference: "user-ref",
      total_cents: 9999,
      user_overridden_at: "2026-05-25T01:00:00.000Z",
    });
    expect(client.listBankTransactions).toHaveBeenCalledWith({
      ifModifiedSince: connection.last_synced_at,
      page: 1,
      where: 'Status=="AUTHORISED"',
    });
  });
});

function selectEq(data: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}
