import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockXeroTokenEndpointError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(`Xero token endpoint failed (${status}): ${detail}`);
      this.name = "XeroTokenEndpointError";
    }

    get isInvalidGrant() {
      return this.status === 400 && this.detail.includes("invalid_grant");
    }
  }

  return {
    apiCalls: [] as unknown[],
    connection: {
      id: "11111111-1111-1111-1111-111111111111",
      platform_tenant_id: "22222222-2222-2222-2222-222222222222",
      xero_tenant_id: "xero-tenant-1",
      encrypted_access_token: "enc:old-access",
      encrypted_refresh_token: "enc:old-refresh",
      access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      status: "active",
    },
    refreshTokens: vi.fn(),
    revokeXeroConnection: vi.fn(),
    XeroTokenEndpointError: MockXeroTokenEndpointError,
  };
});

const supabase = {
  rpc: vi.fn(async (name: string, args: Record<string, string>) => {
    if (name === "xero_lock_connection_refresh") {
      return { data: null, error: null };
    }
    if (name === "xero_encrypt_token") {
      return { data: `enc:${args.plain}`, error: null };
    }
    if (name === "xero_decrypt_token") {
      return { data: args.cipher.replace("enc:", ""), error: null };
    }
    return { data: null, error: new Error(`unexpected rpc ${name}`) };
  }),
  from: vi.fn((table: string) => {
    if (table === "xero_connections") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { ...mocks.connection }, error: null })),
          })),
        })),
        update: vi.fn((patch: Record<string, unknown>) => ({
          eq: vi.fn(async () => {
            Object.assign(mocks.connection, patch);
            return { error: null };
          }),
        })),
      };
    }

    if (table === "xero_api_calls") {
      return {
        insert: vi.fn(async (row: unknown) => {
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

vi.mock("@/lib/xero/oauth", () => ({
  refreshTokens: mocks.refreshTokens,
  revokeXeroConnection: mocks.revokeXeroConnection,
  XeroTokenEndpointError: mocks.XeroTokenEndpointError,
}));

describe("Xero token refresh", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.apiCalls.length = 0;
    Object.assign(mocks.connection, {
      encrypted_access_token: "enc:old-access",
      encrypted_refresh_token: "enc:old-refresh",
      access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      status: "active",
    });
    const { clearTokenCacheForTests } = await import("./tokens");
    clearTokenCacheForTests();
  });

  it("single-flights concurrent refreshes for one connection", async () => {
    mocks.refreshTokens.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 1800,
      token_type: "Bearer",
      scope: "offline_access accounting.transactions",
    });

    const { getAccessToken } = await import("./tokens");
    const tokens = await Promise.all(
      Array.from({ length: 10 }, () => getAccessToken(mocks.connection.id)),
    );

    expect(tokens).toEqual(Array(10).fill("new-access"));
    expect(mocks.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mocks.apiCalls).toHaveLength(1);
    expect(mocks.connection.encrypted_access_token).toBe("enc:new-access");
    expect(mocks.connection.encrypted_refresh_token).toBe("enc:new-refresh");
  });

  it("marks invalid_grant refresh failures as reauth required", async () => {
    mocks.refreshTokens.mockRejectedValue(
      new mocks.XeroTokenEndpointError(400, '{"error":"invalid_grant"}'),
    );

    const { getAccessToken, XeroReauthRequiredError } = await import("./tokens");
    await expect(getAccessToken(mocks.connection.id)).rejects.toBeInstanceOf(
      XeroReauthRequiredError,
    );

    expect(mocks.connection.status).toBe("reauth_required");
    expect(mocks.apiCalls).toHaveLength(1);
  });
});
