import type { TypedSupabaseClient } from "@/lib/supabase/tenant-scoped";

export type RawMatch = {
  id: string;
  suggestion_source: "rule" | "ai";
  suggested_category_id: string | null;
  suggested_contact_id: string | null;
  suggested_project_id: string | null;
  suggested_tax_rate_id: string | null;
  action_applied: boolean;
  accepted_at: string | null;
  override_at: string | null;
  ai_model: string | null;
  ai_confidence: number | null;
};

export type QueueItem = {
  id: string;
  description: string | null;
  date: string | null;
  total_cents: number | null;
  type: "SPEND" | "RECEIVE" | "SPEND-TRANSFER" | "RECEIVE-TRANSFER" | null;
  match: RawMatch | null;
  categoryName: string | null;
  categoryCode: string | null;
};

export type SuggestionStatus = "no-suggestion" | "pending" | "accepted" | "overridden";

export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(match: RawMatch | null): ConfidenceLevel | null {
  if (!match || match.suggestion_source === "rule") return null;
  if (match.ai_confidence === null) return null;
  if (match.ai_confidence >= 0.8) return "high";
  if (match.ai_confidence >= 0.5) return "medium";
  return "low";
}

export function getSuggestionStatus(match: RawMatch | null): SuggestionStatus {
  if (!match) return "no-suggestion";
  if (match.override_at) return "overridden";
  if (match.action_applied) return "accepted";
  return "pending";
}

export async function loadQueueItems(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
  xeroTenantId: string,
): Promise<QueueItem[]> {
  const { data: rows, error } = await supabase
    .from("xero_bank_transactions")
    .select(
      `id, description, date, total_cents, type,
       transaction_rule_matches (
         id, suggestion_source,
         suggested_category_id, suggested_contact_id,
         suggested_project_id, suggested_tax_rate_id,
         action_applied, accepted_at, override_at, ai_model, ai_confidence
       )`,
    )
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", xeroTenantId)
    .eq("is_reconciled", false)
    .order("date", { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!rows) return [];

  // Collect unique category IDs to resolve names in one query
  const categoryIds = [
    ...new Set(
      rows
        .flatMap((r) => r.transaction_rule_matches as RawMatch[])
        .map((m) => m?.suggested_category_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const accountMap = new Map<string, { name: string; code: string | null }>();
  if (categoryIds.length > 0) {
    const { data: accounts } = await supabase
      .from("xero_accounts")
      .select("xero_account_id, name, code")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .in("xero_account_id", categoryIds);

    for (const acc of accounts ?? []) {
      accountMap.set(acc.xero_account_id, { name: acc.name, code: acc.code });
    }
  }

  return rows.map((row) => {
    const matches = (row.transaction_rule_matches ?? []) as RawMatch[];
    // Prefer 'rule' match over 'ai'; in practice there's at most one of each
    const match =
      matches.find((m) => m.suggestion_source === "rule") ??
      matches.find((m) => m.suggestion_source === "ai") ??
      null;

    const acc = match?.suggested_category_id
      ? accountMap.get(match.suggested_category_id)
      : null;

    return {
      id: row.id,
      description: row.description,
      date: row.date,
      total_cents: row.total_cents,
      type: row.type,
      match,
      categoryName: acc?.name ?? null,
      categoryCode: acc?.code ?? null,
    };
  });
}
