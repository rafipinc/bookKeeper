import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUserPlatformTenant: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant-scoped", () => ({
  ensureUserPlatformTenant: mocks.ensureUserPlatformTenant,
}));

import {
  acceptSuggestion,
  buildAssistantTools,
  createAssistantService,
  executeAssistantTool,
  loadAssistantTenantContext,
  resolveAssistantModel,
} from "./service";

type QueryResult = {
  data: unknown;
  error: Error | null;
  count?: number;
};

function createQuery(result: QueryResult) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    ilike: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return query;
}

function makeSupabaseMock(responses: Record<string, QueryResult[]>) {
  const queries: Record<string, any[]> = {};
  const from = vi.fn((table: string) => {
    const queue = responses[table] ?? [];
    const result = queue.shift() ?? { data: null, error: null };
    const query = createQuery(result);
    (queries[table] ??= []).push(query);
    return query;
  });

  return { from, queries };
}

function makeContext(overrides: Partial<Awaited<ReturnType<typeof loadAssistantTenantContext>>> = {}) {
  return {
    platformTenantId: "tenant-1",
    connections: [
      {
        id: "conn-1",
        xero_tenant_id: "xero-1",
        xero_tenant_name: "Tenant One",
        status: "active" as const,
        last_synced_at: "2026-05-28T10:00:00.000Z",
        scopes: ["accounting.transactions"],
        created_at: "2026-05-28T09:00:00.000Z",
      },
    ],
    activeConnection: {
      id: "conn-1",
      xero_tenant_id: "xero-1",
      xero_tenant_name: "Tenant One",
      status: "active" as const,
      last_synced_at: "2026-05-28T10:00:00.000Z",
      scopes: ["accounting.transactions"],
      created_at: "2026-05-28T09:00:00.000Z",
    },
    ...overrides,
  };
}

describe("resolveAssistantModel", () => {
  it("falls back to the cheap default model", () => {
    expect(resolveAssistantModel({ OPENAI_ASSISTANT_MODEL: "" } as NodeJS.ProcessEnv)).toBe(
      "gpt-4.1-nano",
    );
  });

  it("uses the configured assistant model when set", () => {
    expect(resolveAssistantModel({ OPENAI_ASSISTANT_MODEL: "gpt-4o-mini" } as NodeJS.ProcessEnv)).toBe(
      "gpt-4o-mini",
    );
  });
});

describe("assistant tool definitions", () => {
  it("requires explicit confirmation for accept_suggestion", () => {
    const acceptTool = buildAssistantTools().find((tool) => tool.function.name === "accept_suggestion");

    expect(acceptTool).toBeDefined();
    expect(acceptTool?.function.parameters).toMatchObject({
      required: ["match_id", "confirm"],
      additionalProperties: false,
    });
  });
});

describe("tenant-scoped assistant tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads tenant context through existing Supabase tenant membership checks", async () => {
    mocks.ensureUserPlatformTenant.mockResolvedValue("tenant-1");

    const supabase = makeSupabaseMock({
      xero_connections: [
        {
          data: [
            {
              id: "conn-1",
              xero_tenant_id: "xero-1",
              xero_tenant_name: "Tenant One",
              status: "active",
              last_synced_at: "2026-05-28T10:00:00.000Z",
              scopes: ["accounting.transactions"],
              created_at: "2026-05-28T09:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });

    const context = await loadAssistantTenantContext(
      { from: supabase.from, rpc: vi.fn() } as never,
      "user-1",
    );

    expect(mocks.ensureUserPlatformTenant).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      "user-1",
    );
    expect(supabase.from).toHaveBeenCalledWith("xero_connections");
    expect(context.activeConnection?.xero_tenant_id).toBe("xero-1");
  });

  it("rejects accept_suggestion unless confirm is explicit", async () => {
    const result = await acceptSuggestion(
      { from: vi.fn() } as never,
      makeContext(),
      "match-1",
      false,
    );

    expect(result).toEqual({
      ok: false,
      error: "confirmation_required",
      match_id: "match-1",
    });
  });

  it("scopes queue summary to the active tenant", async () => {
    const supabase = makeSupabaseMock({
      xero_bank_transactions: [
        {
          count: 2,
          data: null,
          error: null,
        },
        {
          data: [
            {
              id: "txn-1",
              description: "AWS Cloud Services",
              date: "2026-05-20",
              total_cents: 4200,
              type: "SPEND",
              transaction_rule_matches: [
                {
                  id: "match-1",
                  suggestion_source: "ai",
                  action_applied: false,
                  accepted_at: null,
                  override_at: null,
                  ai_model: "gpt-4.1-nano",
                  ai_confidence: 0.87,
                  suggested_category_id: "acc-1",
                  suggested_contact_id: "con-1",
                },
              ],
            },
          ],
          error: null,
        },
      ],
    });

    const toolResult = await executeAssistantTool(
      { from: supabase.from, rpc: vi.fn() } as never,
      makeContext(),
      { id: "call-1", name: "queue_summary", arguments: "{}" },
    );

    expect(toolResult.output).toMatchObject({
      ok: true,
      queue: {
        count: 2,
        connection: {
          xero_tenant_id: "xero-1",
        },
        recent: [
          {
            id: "txn-1",
            suggestion_status: "pending",
            suggested_category_id: "acc-1",
          },
        ],
      },
    });
    expect(supabase.from).toHaveBeenCalledWith("xero_bank_transactions");
  });
});

describe("assistant flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUserPlatformTenant.mockResolvedValue("tenant-1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_ASSISTANT_MODEL", "");
  });

  it("runs a tool call and returns a final assistant reply", async () => {
    const supabase = makeSupabaseMock({
      xero_connections: [
        {
          data: [
            {
              id: "conn-1",
              xero_tenant_id: "xero-1",
              xero_tenant_name: "Tenant One",
              status: "active",
              last_synced_at: "2026-05-28T10:00:00.000Z",
              scopes: ["accounting.transactions"],
              created_at: "2026-05-28T09:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      xero_bank_transactions: [
        {
          count: 2,
          data: null,
          error: null,
        },
        {
          data: [
            {
              id: "txn-1",
              description: "AWS Cloud Services",
              date: "2026-05-20",
              total_cents: 4200,
              type: "SPEND",
              transaction_rule_matches: [],
            },
          ],
          error: null,
        },
      ],
    });

    const fetchResponses = [
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "queue_summary",
                      arguments: "{}",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "There are 2 unreconciled transactions in the current queue.",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ];

    mocks.fetch.mockImplementation(async () => fetchResponses.shift() ?? new Response("{}", { status: 200 }));

    const service = await createAssistantService({
      supabase: { from: supabase.from, rpc: vi.fn() } as never,
      userId: "user-1",
      apiKey: "test-key",
      fetchImpl: mocks.fetch,
      env: { OPENAI_API_KEY: "test-key", OPENAI_ASSISTANT_MODEL: "" } as NodeJS.ProcessEnv,
    });

    const result = await service.run("Summarise the queue");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.reply).toContain("2 unreconciled transactions");
      expect(result.toolTrace).toHaveLength(1);
      expect(result.toolTrace[0].name).toBe("queue_summary");
    }
  });
});
