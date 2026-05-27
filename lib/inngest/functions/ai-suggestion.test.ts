import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
  send: vi.fn(),
  fetch: vi.fn(),
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

vi.stubGlobal("fetch", mocks.fetch);

import {
  aiSuggestionInternals,
  buildPromptMessages,
  type AISuggestionContext,
  type AISuggestionResult,
} from "./ai-suggestion";

function makeContext(overrides: Partial<AISuggestionContext> = {}): AISuggestionContext {
  return {
    transactionId: "txn-1",
    description: "AWS Cloud Services",
    amountCents: 4200,
    date: "2026-05-20",
    reference: "INV-100",
    transactionType: "SPEND",
    bankAccountName: "Business Cheque",
    accounts: [
      { xero_account_id: "acc-1", code: "300", name: "Software & SaaS" },
      { xero_account_id: "acc-2", code: "310", name: "Cloud Infrastructure" },
    ],
    contacts: [
      { xero_contact_id: "con-1", name: "Amazon Web Services" },
      { xero_contact_id: "con-2", name: "Google Cloud" },
    ],
    taxRates: [{ xero_tax_type: "NONE", name: "No Tax" }],
    pastSuggestions: [
      { description: "AWS Monthly Bill", categoryId: "acc-2" },
    ],
    ...overrides,
  };
}

function makeOpenAIResponse(content: string, model = "gpt-4o-mini-2024-07-18") {
  return {
    ok: true,
    json: async () => ({
      model,
      choices: [{ message: { content } }],
    }),
  };
}

describe("ai-suggestion function registration", () => {
  it("registers with id 'ai-suggestion', retries 0, and no_rule_match trigger", async () => {
    await import("./ai-suggestion");

    expect(mocks.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ai-suggestion",
        retries: 0,
        triggers: [{ event: "xero/bank_transaction.no_rule_match" }],
      }),
      expect.any(Function),
    );
  });
});

describe("callOpenAI", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.fetch.mockReset();
  });

  it("returns a suggestion result when OpenAI returns valid JSON", async () => {
    const responseJson = JSON.stringify({
      category_id: "acc-2",
      contact_id: "con-1",
      confidence: 0.9,
    });
    mocks.fetch.mockResolvedValue(makeOpenAIResponse(responseJson));

    const result = await aiSuggestionInternals.callOpenAI(makeContext());

    expect(result).toEqual<AISuggestionResult>({
      categoryId: "acc-2",
      contactId: "con-1",
      confidence: 0.9,
      model: "gpt-4o-mini-2024-07-18",
    });
  });

  it("treats null category_id and contact_id as null in result", async () => {
    const responseJson = JSON.stringify({
      category_id: null,
      contact_id: null,
      confidence: 0.5,
    });
    mocks.fetch.mockResolvedValue(makeOpenAIResponse(responseJson));

    const result = await aiSuggestionInternals.callOpenAI(makeContext());

    expect(result).not.toBeNull();
    expect(result?.categoryId).toBeNull();
    expect(result?.contactId).toBeNull();
    expect(result?.confidence).toBe(0.5);
  });

  it("returns null and does not throw when OpenAI returns invalid JSON", async () => {
    mocks.fetch.mockResolvedValue(makeOpenAIResponse("not-valid-json{{{"));

    await expect(aiSuggestionInternals.callOpenAI(makeContext())).resolves.toBeNull();
  });

  it("returns null and does not throw when OpenAI returns malformed structure", async () => {
    // Valid JSON but missing required 'confidence' field
    const responseJson = JSON.stringify({ category_id: "acc-1" });
    mocks.fetch.mockResolvedValue(makeOpenAIResponse(responseJson));

    await expect(aiSuggestionInternals.callOpenAI(makeContext())).resolves.toBeNull();
  });

  it("returns null and does not throw when fetch throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));

    await expect(aiSuggestionInternals.callOpenAI(makeContext())).resolves.toBeNull();
  });

  it("returns null and does not throw when OpenAI returns HTTP error", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    await expect(aiSuggestionInternals.callOpenAI(makeContext())).resolves.toBeNull();
  });

  it("returns null when OPENAI_API_KEY is not set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(aiSuggestionInternals.callOpenAI(makeContext())).resolves.toBeNull();
  });

  it("clamps confidence to [0, 1]", async () => {
    const responseJson = JSON.stringify({
      category_id: "acc-1",
      contact_id: null,
      confidence: 1.5,
    });
    mocks.fetch.mockResolvedValue(makeOpenAIResponse(responseJson));

    const result = await aiSuggestionInternals.callOpenAI(makeContext());
    expect(result?.confidence).toBe(1);
  });
});

describe("buildPromptMessages", () => {
  it("includes transaction facts in user message", () => {
    const msgs = buildPromptMessages(makeContext());
    const user = msgs.find((m) => m.role === "user")!.content;

    expect(user).toContain("AWS Cloud Services");
    expect(user).toContain("$42.00");
    expect(user).toContain("2026-05-20");
    expect(user).toContain("Business Cheque");
    expect(user).toContain("INV-100");
  });

  it("includes chart of accounts with ids", () => {
    const msgs = buildPromptMessages(makeContext());
    const user = msgs.find((m) => m.role === "user")!.content;

    expect(user).toContain("acc-1");
    expect(user).toContain("Software & SaaS");
  });

  it("includes contacts", () => {
    const msgs = buildPromptMessages(makeContext());
    const user = msgs.find((m) => m.role === "user")!.content;

    expect(user).toContain("Amazon Web Services");
    expect(user).toContain("con-1");
  });

  it("includes past suggestions as few-shot examples", () => {
    const msgs = buildPromptMessages(makeContext());
    const user = msgs.find((m) => m.role === "user")!.content;

    expect(user).toContain("AWS Monthly Bill");
    expect(user).toContain("acc-2");
  });

  it("truncates user content to the token budget", () => {
    const manyAccounts = Array.from({ length: 500 }, (_, i) => ({
      xero_account_id: `acc-${i}`,
      code: `${300 + i}`,
      name: "A".repeat(100),
    }));
    const ctx = makeContext({ accounts: manyAccounts });
    const msgs = buildPromptMessages(ctx);
    const user = msgs.find((m) => m.role === "user")!.content;

    // 6000 tokens * 4 chars/token = 24000 chars
    expect(user.length).toBeLessThanOrEqual(24_000);
  });
});

describe("ai-suggestion handler", () => {
  async function runHandler(opts: {
    context: AISuggestionContext | null;
    suggestion: AISuggestionResult | null;
  }) {
    const { aiSuggestionInternals: internals } = await import("./ai-suggestion");

    const loadContext = vi
      .spyOn(internals, "loadContext")
      .mockResolvedValue(opts.context);
    const callOpenAI = vi
      .spyOn(internals, "callOpenAI")
      .mockResolvedValue(opts.suggestion);
    const writeAIMatch = vi
      .spyOn(internals, "writeAIMatch")
      .mockResolvedValue(undefined);

    const call = mocks.createFunction.mock.calls.find(
      ([config]) => (config as { id?: string }).id === "ai-suggestion",
    );
    if (!call) throw new Error("ai-suggestion function not registered");

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
    return { result, loadContext, callOpenAI, writeAIMatch };
  }

  it("inserts a match row when OpenAI returns a valid suggestion", async () => {
    const suggestion: AISuggestionResult = {
      categoryId: "acc-2",
      contactId: "con-1",
      confidence: 0.9,
      model: "gpt-4o-mini",
    };

    const { result, writeAIMatch } = await runHandler({
      context: makeContext(),
      suggestion,
    });

    expect(result).toEqual({ transactionId: "txn-1", inserted: true });
    expect(writeAIMatch).toHaveBeenCalledWith("txn-1", suggestion);
  });

  it("does not insert a row and does not throw when OpenAI returns null", async () => {
    const { result, writeAIMatch } = await runHandler({
      context: makeContext(),
      suggestion: null,
    });

    expect(result).toEqual({ transactionId: "txn-1", inserted: false });
    expect(writeAIMatch).not.toHaveBeenCalled();
  });

  it("returns skipped when transaction is not found", async () => {
    const { result, callOpenAI, writeAIMatch } = await runHandler({
      context: null,
      suggestion: null,
    });

    expect(result).toEqual({ transactionId: "txn-1", skipped: "transaction-not-found" });
    expect(callOpenAI).not.toHaveBeenCalled();
    expect(writeAIMatch).not.toHaveBeenCalled();
  });
});
