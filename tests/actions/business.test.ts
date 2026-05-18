import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildFormData, makeSupabaseMock } from "@/tests/helpers/supabase-mocks";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { createBusiness } from "@/app/actions/business";

describe("createBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation error when business name is missing", async () => {
    const state = await createBusiness(
      { error: null },
      buildFormData({ name: "", businessType: "" }),
    );

    expect(state).toEqual({ error: "Business name is required." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns generic error when user is unauthenticated", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseMock({ user: null }));

    const state = await createBusiness(
      { error: null },
      buildFormData({ name: "Acme", businessType: "sole-prop" }),
    );

    expect(state).toEqual({ error: "Couldn't save your business. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns success on insert path and revalidates pages", async () => {
    const supabase = makeSupabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    const state = await createBusiness(
      { error: null },
      buildFormData({ name: "Acme", businessType: "sole-prop" }),
    );

    expect(state).toEqual({ error: null });
    expect(supabase.from).toHaveBeenCalledWith("businesses");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ledger");
  });

  it("returns success for duplicate business unique violation", async () => {
    mocks.createClient.mockResolvedValue(
      makeSupabaseMock({ businessesInsertError: { code: "23505" } }),
    );

    const state = await createBusiness(
      { error: null },
      buildFormData({ name: "Acme", businessType: "" }),
    );

    expect(state).toEqual({ error: null });
  });

  it("returns generic error when insert fails", async () => {
    mocks.createClient.mockResolvedValue(
      makeSupabaseMock({ businessesInsertError: { code: "XX000" } }),
    );

    const state = await createBusiness(
      { error: null },
      buildFormData({ name: "Acme", businessType: "" }),
    );

    expect(state).toEqual({ error: "Couldn't save your business. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
