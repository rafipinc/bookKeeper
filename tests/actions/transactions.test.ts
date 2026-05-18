import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildFormData, makeSupabaseMock } from "@/tests/helpers/supabase-mocks";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { createTransaction } from "@/app/actions/transactions";

function validForm(overrides: Record<string, string> = {}) {
  return buildFormData({
    type: "expense",
    amount: "12.34",
    date: "2026-05-18",
    categoryId: "cat-1",
    note: "Coffee",
    ...overrides,
  });
}

describe("createTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation errors before touching Supabase", async () => {
    expect(await createTransaction({ error: null }, validForm({ type: "other" }))).toEqual(
      { error: "Pick a transaction type." },
    );
    expect(await createTransaction({ error: null }, validForm({ amount: "0" }))).toEqual(
      { error: "Enter a valid amount." },
    );
    expect(await createTransaction({ error: null }, validForm({ date: "" }))).toEqual(
      { error: "Choose a date." },
    );
    expect(await createTransaction({ error: null }, validForm({ categoryId: "" }))).toEqual(
      { error: "Choose a category." },
    );

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns unauthenticated error", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseMock({ user: null }));

    const state = await createTransaction({ error: null }, validForm());

    expect(state).toEqual({ error: "You must be signed in." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns error when business profile does not exist", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseMock({ businessId: null }));

    const state = await createTransaction({ error: null }, validForm());

    expect(state).toEqual({ error: "Create your business profile first." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns success on insert path and revalidates pages", async () => {
    const supabase = makeSupabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    const state = await createTransaction({ error: null }, validForm());

    expect(state).toEqual({ error: null });
    expect(supabase.from).toHaveBeenCalledWith("businesses");
    expect(supabase.from).toHaveBeenCalledWith("transactions");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ledger");
  });

  it("returns generic error when transaction insert fails", async () => {
    mocks.createClient.mockResolvedValue(
      makeSupabaseMock({ transactionsInsertError: { code: "XX000" } }),
    );

    const state = await createTransaction({ error: null }, validForm());

    expect(state).toEqual({ error: "Could not save transaction. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
