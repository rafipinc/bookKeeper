"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

type CreateTransactionState = {
  error: string | null;
};

function dollarsToCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

export async function createTransaction(
  _previousState: CreateTransactionState,
  formData: FormData,
): Promise<CreateTransactionState> {
  const type = String(formData.get("type") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const noteRaw = String(formData.get("note") ?? "").trim();

  if (type !== "income" && type !== "expense") {
    return { error: "Pick a transaction type." };
  }

  const amountCents = dollarsToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    return { error: "Enter a valid amount." };
  }

  if (!date) {
    return { error: "Choose a date." };
  }

  if (!categoryId) {
    return { error: "Choose a category." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: business } = await supabase
    .from("businesses")
    .select("id,platform_tenant_id")
    .eq("owner_id", user.id)
    .eq("platform_tenant_id", platformTenantId)
    .limit(1)
    .single();

  if (!business) {
    return { error: "Create your business profile first." };
  }

  const { error } = await supabase.from("transactions").insert({
    platform_tenant_id: business.platform_tenant_id,
    business_id: business.id,
    category_id: categoryId,
    type,
    amount_cents: amountCents,
    currency: "USD",
    date,
    note: noteRaw || null,
  });

  if (error) {
    return { error: "Could not save transaction. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  return { error: null };
}
