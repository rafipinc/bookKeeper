"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AcceptResult = { error: string | null };
export type OverrideResult = { error: string | null };

export async function acceptSuggestion(matchId: string): Promise<AcceptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("transaction_rule_matches")
    .update({
      action_applied: true,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) {
    return { error: "Could not accept suggestion. Try again." };
  }

  revalidatePath("/reconcile", "layout");
  return { error: null };
}

export type BulkAcceptResult = { error: string | null };

export async function bulkAcceptSuggestions(
  matchIds: string[],
): Promise<BulkAcceptResult> {
  if (matchIds.length === 0) return { error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("transaction_rule_matches")
    .update({
      action_applied: true,
      accepted_at: new Date().toISOString(),
    })
    .in("id", matchIds);

  if (error) {
    return { error: "Could not bulk accept suggestions. Try again." };
  }

  revalidatePath("/reconcile", "layout");
  return { error: null };
}

export type OverrideFields = {
  suggested_category_id: string | null;
  suggested_contact_id: string | null;
};

export async function overrideSuggestion(
  matchId: string,
  fields: OverrideFields,
): Promise<OverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("transaction_rule_matches")
    .update({
      suggested_category_id: fields.suggested_category_id,
      suggested_contact_id: fields.suggested_contact_id,
      action_applied: true,
      accepted_at: now,
      override_at: now,
      override_by_user_id: user.id,
    })
    .eq("id", matchId);

  if (error) {
    return { error: "Could not save override. Try again." };
  }

  revalidatePath("/reconcile", "layout");
  return { error: null };
}
