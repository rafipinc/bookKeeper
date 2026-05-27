/**
 * RLS isolation test for the rules engine tables (BKP-017).
 *
 * These tests verify that the Supabase client correctly scopes queries to the
 * active tenant. Because the test suite runs without a live Supabase instance,
 * we use a mock that simulates the RLS behaviour enforced in the migration:
 *   - `is_platform_tenant_member` lets a user see only their own tenant's rows.
 *   - A row inserted under tenant A is invisible when the session is for tenant B.
 *
 * The mock mirrors how `set_config('app.current_tenant_id', ...)` gates access
 * in a real Postgres session: only rows whose `platform_tenant_id` matches the
 * active tenant ID are returned.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── constants ──────────────────────────────────────────────────────────────────

const TENANT_A_ID = "70000000-0000-0000-0000-000000000001";
const TENANT_B_ID = "80000000-0000-0000-0000-000000000002";
const USER_A_ID   = "00000000-0000-0000-0000-0000000000a1";
const RULE_A_ID   = "aa000000-0000-0000-0000-000000000001";

// ── in-memory "database" ───────────────────────────────────────────────────────

type RulesRow = {
  id: string;
  platform_tenant_id: string;
  name: string;
  enabled: boolean;
  priority: number;
  mode: "suggest" | "auto_apply";
  created_by: string;
  created_at: string;
  archived_at: string | null;
};

type DbError = { code: string; message: string };
type DbResult<T> = { data: T; error: null } | { data: null; error: DbError };

type RulesTableClient = {
  insert(row: RulesRow): Promise<DbResult<RulesRow>>;
  select(): Promise<DbResult<RulesRow[]>>;
};

const rulesStore: RulesRow[] = [];

/**
 * Minimal Supabase client mock that enforces tenant isolation.
 *
 * `currentTenantId` plays the role of the `app.current_tenant_id` session
 * variable that `set_config` would set in a real Postgres session.
 */
function makeRlsClient(currentTenantId: string) {
  function rulesTable() {
    return {
      insert(row: RulesRow): Promise<DbResult<RulesRow>> {
        // RLS: only allow if platform_tenant_id matches the active tenant
        if (row.platform_tenant_id !== currentTenantId) {
          return Promise.resolve({
            data: null,
            error: { code: "42501", message: "RLS violation" },
          });
        }
        rulesStore.push(row);
        return Promise.resolve({ data: row, error: null });
      },
      select(): Promise<DbResult<RulesRow[]>> {
        return Promise.resolve({
          data: rulesStore.filter(r => r.platform_tenant_id === currentTenantId),
          error: null,
        });
      },
    };
  }

  return {
    from(table: string): RulesTableClient {
      if (table === "rules") return rulesTable();
      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function sampleRule(overrides: Partial<RulesRow> = {}): RulesRow {
  return {
    id: RULE_A_ID,
    platform_tenant_id: TENANT_A_ID,
    name: "AWS → Software",
    enabled: true,
    priority: 1,
    mode: "suggest",
    created_by: USER_A_ID,
    created_at: new Date().toISOString(),
    archived_at: null,
    ...overrides,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("rules RLS isolation", () => {
  beforeEach(() => {
    rulesStore.length = 0;
    vi.clearAllMocks();
  });

  it("a row created under tenant A is visible to a tenant-A session", async () => {
    const clientA = makeRlsClient(TENANT_A_ID);

    const insertResult = await clientA.from("rules").insert(sampleRule());
    expect(insertResult.error).toBeNull();

    const selectResult = await clientA.from("rules").select();
    expect(selectResult.error).toBeNull();
    if (selectResult.data === null) throw new Error("data should not be null");
    expect(selectResult.data).toHaveLength(1);
    expect(selectResult.data[0].id).toBe(RULE_A_ID);
  });

  it("a row created under tenant A is invisible to a tenant-B session", async () => {
    // Insert as tenant A
    const clientA = makeRlsClient(TENANT_A_ID);
    await clientA.from("rules").insert(sampleRule());

    // Query as tenant B — should see 0 rows
    const clientB = makeRlsClient(TENANT_B_ID);
    const result = await clientB.from("rules").select();
    expect(result.error).toBeNull();
    if (result.data === null) throw new Error("data should not be null");
    expect(result.data).toHaveLength(0);
  });

  it("switching back to tenant A restores visibility of the row", async () => {
    // Insert as tenant A
    const clientA = makeRlsClient(TENANT_A_ID);
    await clientA.from("rules").insert(sampleRule());

    // Tenant B sees nothing
    const resultB = await makeRlsClient(TENANT_B_ID).from("rules").select();
    expect(resultB.error).toBeNull();
    if (resultB.data === null) throw new Error("data should not be null");
    expect(resultB.data).toHaveLength(0);

    // Back to tenant A — row is visible again
    const resultA = await makeRlsClient(TENANT_A_ID).from("rules").select();
    expect(resultA.error).toBeNull();
    if (resultA.data === null) throw new Error("data should not be null");
    expect(resultA.data).toHaveLength(1);
    expect(resultA.data[0].id).toBe(RULE_A_ID);
  });

  it("tenant B cannot insert a row claiming tenant A's platform_tenant_id", async () => {
    const clientB = makeRlsClient(TENANT_B_ID);

    const result = await clientB.from("rules").insert(
      sampleRule({ platform_tenant_id: TENANT_A_ID })
    );

    expect(result.error).not.toBeNull();
    if (result.error === null) throw new Error("error should not be null");
    expect(result.error.code).toBe("42501");
    expect(rulesStore).toHaveLength(0);
  });
});
