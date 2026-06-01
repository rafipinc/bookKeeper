import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeUpdateSupabase() {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  return {
    from: vi.fn(() => ({ update })),
    update,
    eq,
  };
}

function makeSyncStatusSupabase() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: {
        xero_tenant_name: "Demo Books",
        status: "active",
        last_synced_at: "2026-06-01T00:00:00.000Z",
      },
      error: null,
    })),
  };

  return {
    from: vi.fn(() => query),
    query,
  };
}

describe("reconcile assistant", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("returns a configuration message when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_ASSISTANT_MODEL", "gpt-5.4-nano");
    vi.stubEnv("OPENAI_API_KEY", "");
    const { runReconcileAssistant } = await import("./reconcile-assistant");

    const result = await runReconcileAssistant({
      supabase: {} as never,
      platformTenantId: "tenant-1",
      xeroTenantId: "xero-1",
      messages: [{ role: "user", content: "Summarise the queue" }],
    });

    expect(result.model).toBe("gpt-5.4-nano");
    expect(result.message).toContain("OPENAI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires confirmation before accepting a suggestion", async () => {
    const { reconcileAssistantInternals } = await import("./reconcile-assistant");

    const result = await reconcileAssistantInternals.executeTool(
      {
        callId: "call-1",
        name: "accept_reconciliation_suggestion",
        argumentsJson: JSON.stringify({ match_id: "match-1", confirmed: false }),
      },
      {
        supabase: {} as never,
        platformTenantId: "tenant-1",
        xeroTenantId: "xero-1",
      },
    );

    expect(result.pendingConfirmation).toEqual({
      type: "accept_reconciliation_suggestion",
      matchId: "match-1",
      summary: expect.stringContaining("Accept this suggestion"),
    });
    expect(result.output).toMatchObject({ status: "confirmation_required" });
  });

  it("applies a confirmed accept action through the scoped Supabase client", async () => {
    const { runReconcileAssistant } = await import("./reconcile-assistant");
    const supabase = makeUpdateSupabase();

    const result = await runReconcileAssistant({
      supabase: supabase as never,
      platformTenantId: "tenant-1",
      xeroTenantId: "xero-1",
      messages: [],
      confirmedAction: {
        type: "accept_reconciliation_suggestion",
        matchId: "match-1",
      },
    });

    expect(result.model).toBe("local-action");
    expect(result.message).toContain("Accepted");
    expect(supabase.from).toHaveBeenCalledWith("transaction_rule_matches");
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ action_applied: true }),
    );
    expect(supabase.eq).toHaveBeenCalledWith("id", "match-1");
  });

  it("can run a model-requested tool and return the final answer", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_ASSISTANT_MODEL", "gpt-5.4-nano");
    const { runReconcileAssistant } = await import("./reconcile-assistant");

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "gpt-5.4-nano",
          output: [
            {
              type: "function_call",
              call_id: "call-1",
              name: "get_xero_sync_status",
              arguments: "{}",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "gpt-5.4-nano",
          output_text: "Demo Books last synced on 1 June 2026.",
          output: [],
        }),
      });

    const supabase = makeSyncStatusSupabase();
    const result = await runReconcileAssistant({
      supabase: supabase as never,
      platformTenantId: "tenant-1",
      xeroTenantId: "xero-1",
      messages: [{ role: "user", content: "When did Xero last sync?" }],
    });

    expect(result.message).toBe("Demo Books last synced on 1 June 2026.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(supabase.from).toHaveBeenCalledWith("xero_connections");
  });
});
