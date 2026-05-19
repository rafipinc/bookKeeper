import { vi } from "vitest";

type User = { id: string } | null;
type DbError = { code?: string; message?: string } | null;

type SupabaseMockOptions = {
  user?: User;
  businessId?: string | null;
  platformTenantId?: string;
  businessesInsertError?: DbError;
  transactionsInsertError?: DbError;
  rpcError?: DbError;
};

export function makeSupabaseMock(options: SupabaseMockOptions = {}) {
  const {
    user = { id: "user-1" },
    businessId = "business-1",
    platformTenantId = "tenant-1",
    businessesInsertError = null,
    transactionsInsertError = null,
    rpcError = null,
  } = options;

  const from = vi.fn((table: string) => {
    if (table === "businesses") {
      const businessQuery = {
        eq: vi.fn(() => businessQuery),
        limit: vi.fn(() => businessQuery),
        single: vi.fn(async () => ({
          data: businessId ? { id: businessId, platform_tenant_id: platformTenantId } : null,
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({
          data: businessId ? { id: businessId, platform_tenant_id: platformTenantId } : null,
          error: null,
        })),
      };

      return {
        insert: vi.fn(async () => ({ error: businessesInsertError })),
        select: vi.fn(() => businessQuery),
      };
    }

    if (table === "transactions") {
      return {
        insert: vi.fn(async () => ({ error: transactionsInsertError })),
      };
    }

    return {};
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    rpc: vi.fn(async () => ({ data: platformTenantId, error: rpcError })),
    from,
  };
}

export function buildFormData(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return form;
}
