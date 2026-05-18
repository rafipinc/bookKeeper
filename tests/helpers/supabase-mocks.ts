import { vi } from "vitest";

type User = { id: string } | null;
type DbError = { code?: string; message?: string } | null;

type SupabaseMockOptions = {
  user?: User;
  businessId?: string | null;
  businessesInsertError?: DbError;
  transactionsInsertError?: DbError;
};

export function makeSupabaseMock(options: SupabaseMockOptions = {}) {
  const {
    user = { id: "user-1" },
    businessId = "business-1",
    businessesInsertError = null,
    transactionsInsertError = null,
  } = options;

  const from = vi.fn((table: string) => {
    if (table === "businesses") {
      return {
        insert: vi.fn(async () => ({ error: businessesInsertError })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: businessId ? { id: businessId } : null,
                error: null,
              })),
            })),
          })),
        })),
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
