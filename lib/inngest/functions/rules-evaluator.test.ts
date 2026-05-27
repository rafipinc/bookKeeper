import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
  send: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: mocks.createFunction,
    send: mocks.send,
  },
}));

import {
  evaluateRules,
  type EvaluatorRule,
  type EvaluatorTransactionFacts,
} from "./rules-evaluator";

function makeFacts(overrides: Partial<EvaluatorTransactionFacts> = {}): EvaluatorTransactionFacts {
  return {
    id: "txn-1",
    platform_tenant_id: "tenant-1",
    xero_tenant_id: "xero-1",
    description: "AWS Cloud Services",
    reference: "INV-100",
    date: "2026-05-20",
    amount_cents: 4200,
    xero_account_id: "acct-1",
    contact_name: "Amazon Web Services",
    ...overrides,
  };
}

function makeRule(
  id: string,
  priority: number,
  conditions: Array<{ group_id: number; field: string; operator: string; value_json: unknown }>,
  actions: Array<{ action_type: string; value_json: unknown }> = [],
): EvaluatorRule {
  return {
    id,
    platform_tenant_id: "tenant-1",
    xero_tenant_id: null,
    name: id,
    description: null,
    enabled: true,
    priority,
    mode: "suggest",
    current_version_id: `${id}-v1`,
    created_by: "user-1",
    created_at: "2026-05-01T00:00:00.000Z",
    archived_at: null,
    conditions: conditions.map((c, idx) => ({
      id: `${id}-c${idx}`,
      rule_id: id,
      group_id: c.group_id,
      field: c.field as EvaluatorRule["conditions"][number]["field"],
      operator: c.operator as EvaluatorRule["conditions"][number]["operator"],
      value_json: c.value_json as EvaluatorRule["conditions"][number]["value_json"],
    })),
    actions: actions.map((a, idx) => ({
      id: `${id}-a${idx}`,
      rule_id: id,
      action_type: a.action_type as EvaluatorRule["actions"][number]["action_type"],
      value_json: a.value_json as EvaluatorRule["actions"][number]["value_json"],
    })),
  };
}

describe("rules evaluator function registration", () => {
  it("registers with concurrency cap 4 keyed on xeroTenantId", async () => {
    await import("./rules-evaluator");

    expect(mocks.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rules-evaluator",
        concurrency: { key: "event.data.xeroTenantId", limit: 4 },
        triggers: [{ event: "xero/bank_transaction.created" }],
      }),
      expect.any(Function),
    );
  });
});

describe("evaluateRules", () => {
  it("returns null when there are no rules", () => {
    expect(evaluateRules(makeFacts(), [])).toBeNull();
  });

  it("returns null when no rule matches", () => {
    const rule = makeRule("r1", 10, [
      { group_id: 0, field: "description", operator: "contains", value_json: { v: "Stripe" } },
    ]);
    expect(evaluateRules(makeFacts(), [rule])).toBeNull();
  });

  it("matches a single rule and resolves the suggestion payload", () => {
    const rule = makeRule(
      "r1",
      10,
      [{ group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } }],
      [
        { action_type: "set_category", value_json: { v: "category-1" } },
        { action_type: "set_tax_rate", value_json: { v: "tax-1" } },
      ],
    );

    const result = evaluateRules(makeFacts(), [rule]);

    expect(result?.rule.id).toBe("r1");
    expect(result?.suggestion).toEqual({
      suggested_category_id: "category-1",
      suggested_contact_id: null,
      suggested_project_id: null,
      suggested_tax_rate_id: "tax-1",
    });
  });

  it("first-match-wins by priority order", () => {
    const lowPriority = makeRule(
      "low",
      100,
      [{ group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } }],
      [{ action_type: "set_category", value_json: { v: "low-cat" } }],
    );
    const highPriority = makeRule(
      "high",
      1,
      [{ group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } }],
      [{ action_type: "set_category", value_json: { v: "high-cat" } }],
    );

    const result = evaluateRules(makeFacts(), [lowPriority, highPriority]);

    expect(result?.rule.id).toBe("high");
    expect(result?.suggestion.suggested_category_id).toBe("high-cat");
  });

  it("AND within a group: all conditions must match", () => {
    const rule = makeRule("r1", 10, [
      { group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } },
      { group_id: 0, field: "amount_cents", operator: "gte", value_json: { v: 10000 } },
    ]);

    expect(evaluateRules(makeFacts({ amount_cents: 500 }), [rule])).toBeNull();
    expect(evaluateRules(makeFacts({ amount_cents: 20000 }), [rule])?.rule.id).toBe("r1");
  });

  it("OR across groups: any satisfied group wins", () => {
    const rule = makeRule("r1", 10, [
      { group_id: 0, field: "description", operator: "contains", value_json: { v: "stripe" } },
      { group_id: 1, field: "reference", operator: "equals", value_json: { v: "INV-100" } },
    ]);

    expect(evaluateRules(makeFacts(), [rule])?.rule.id).toBe("r1");
    expect(
      evaluateRules(makeFacts({ description: "other", reference: "no" }), [rule]),
    ).toBeNull();
  });

  it("between operator on amount_cents", () => {
    const rule = makeRule("r1", 10, [
      { group_id: 0, field: "amount_cents", operator: "between", value_json: { min: 1000, max: 5000 } },
    ]);
    expect(evaluateRules(makeFacts({ amount_cents: 4200 }), [rule])?.rule.id).toBe("r1");
    expect(evaluateRules(makeFacts({ amount_cents: 9000 }), [rule])).toBeNull();
  });

  it("does not match rules with no conditions", () => {
    const rule = makeRule("r1", 10, []);
    expect(evaluateRules(makeFacts(), [rule])).toBeNull();
  });

  it("date between operator matches ISO dates inclusively", () => {
    const rule = makeRule("r1", 10, [
      {
        group_id: 0,
        field: "date",
        operator: "between",
        value_json: { min: "2026-04-01", max: "2026-06-30" },
      },
    ]);
    expect(evaluateRules(makeFacts({ date: "2026-05-20" }), [rule])?.rule.id).toBe("r1");
    expect(evaluateRules(makeFacts({ date: "2026-07-01" }), [rule])).toBeNull();
  });

  it("date gte/lte operators compare dates as timestamps", () => {
    const gte = makeRule("g", 10, [
      { group_id: 0, field: "date", operator: "gte", value_json: { v: "2026-05-01" } },
    ]);
    const lte = makeRule("l", 10, [
      { group_id: 0, field: "date", operator: "lte", value_json: { v: "2026-05-01" } },
    ]);
    expect(evaluateRules(makeFacts({ date: "2026-05-20" }), [gte])?.rule.id).toBe("g");
    expect(evaluateRules(makeFacts({ date: "2026-04-20" }), [gte])).toBeNull();
    expect(evaluateRules(makeFacts({ date: "2026-04-20" }), [lte])?.rule.id).toBe("l");
    expect(evaluateRules(makeFacts({ date: "2026-05-20" }), [lte])).toBeNull();
  });
});

describe("rules evaluator handler", () => {
  async function runHandler(opts: {
    facts: EvaluatorTransactionFacts | null;
    rules: EvaluatorRule[];
  }) {
    const { rulesEvaluatorInternals } = await import("./rules-evaluator");

    const loadFacts = vi
      .spyOn(rulesEvaluatorInternals, "loadTransactionFacts")
      .mockResolvedValue(opts.facts);
    const loadRuleset = vi
      .spyOn(rulesEvaluatorInternals, "loadRuleset")
      .mockResolvedValue(opts.rules);
    const writeRuleMatch = vi
      .spyOn(rulesEvaluatorInternals, "writeRuleMatch")
      .mockResolvedValue(undefined);
    const clearRuleMatch = vi
      .spyOn(rulesEvaluatorInternals, "clearRuleMatch")
      .mockResolvedValue(undefined);

    mocks.send.mockReset();
    mocks.send.mockResolvedValue(undefined);

    // The first createFunction call captures our handler.
    const call = mocks.createFunction.mock.calls.find(
      ([config]) => (config as { id?: string }).id === "rules-evaluator",
    );
    if (!call) throw new Error("rules-evaluator function not registered");
    const handler = call[1] as (ctx: {
      event: { data: Record<string, string> };
      step: { run: (name: string, fn: () => unknown) => Promise<unknown> };
    }) => Promise<unknown>;

    const step = { run: async (_name: string, fn: () => unknown) => fn() };
    const event = {
      data: {
        transactionId: "txn-1",
        platformTenantId: "tenant-1",
        xeroTenantId: "xero-1",
      },
    };

    const result = await handler({ event, step });

    return { result, loadFacts, loadRuleset, writeRuleMatch, clearRuleMatch };
  }

  it("inserts a match row when a rule matches", async () => {
    const rule = makeRule(
      "r1",
      10,
      [{ group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } }],
      [{ action_type: "set_category", value_json: { v: "cat-1" } }],
    );

    const { result, writeRuleMatch, clearRuleMatch } = await runHandler({
      facts: makeFacts(),
      rules: [rule],
    });

    expect(result).toEqual({ transactionId: "txn-1", matched: true, ruleId: "r1" });
    expect(writeRuleMatch).toHaveBeenCalledWith(
      "txn-1",
      expect.objectContaining({ id: "r1" }),
      expect.objectContaining({ suggested_category_id: "cat-1" }),
    );
    expect(clearRuleMatch).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("emits no_rule_match and clears prior row when nothing matches", async () => {
    const { result, writeRuleMatch, clearRuleMatch } = await runHandler({
      facts: makeFacts({ description: "unrelated" }),
      rules: [
        makeRule("r1", 10, [
          { group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } },
        ]),
      ],
    });

    expect(result).toEqual({ transactionId: "txn-1", matched: false });
    expect(writeRuleMatch).not.toHaveBeenCalled();
    expect(clearRuleMatch).toHaveBeenCalledWith("txn-1");
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "xero/bank_transaction.no_rule_match",
        data: {
          transactionId: "txn-1",
          platformTenantId: "tenant-1",
          xeroTenantId: "xero-1",
        },
      }),
    );
  });

  it("re-running for the same transaction replaces via writeRuleMatch (upsert)", async () => {
    const rule = makeRule(
      "r1",
      10,
      [{ group_id: 0, field: "description", operator: "contains", value_json: { v: "aws" } }],
      [{ action_type: "set_category", value_json: { v: "cat-1" } }],
    );

    const first = await runHandler({ facts: makeFacts(), rules: [rule] });
    const second = await runHandler({ facts: makeFacts(), rules: [rule] });

    expect(first.writeRuleMatch).toHaveBeenCalledTimes(1);
    expect(second.writeRuleMatch).toHaveBeenCalledTimes(1);
    // Both calls go through writeRuleMatch which uses upsert with
    // onConflict on (xero_bank_transaction_id, suggestion_source).
  });

  it("returns skipped when transaction is not found", async () => {
    const { result, loadRuleset, writeRuleMatch } = await runHandler({
      facts: null,
      rules: [],
    });
    expect(result).toEqual({ transactionId: "txn-1", skipped: "transaction-not-found" });
    expect(loadRuleset).not.toHaveBeenCalled();
    expect(writeRuleMatch).not.toHaveBeenCalled();
  });
});
