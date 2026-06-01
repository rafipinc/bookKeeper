import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

import { loadQueueItems, type RawMatch } from "../data";
import { DetailClient, type DetailTransaction, type MatchHistoryRow } from "../detail-client";
import { QueueClient } from "../queue-client";

export default async function ReconcileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  // Load the active Xero connection
  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id, xero_tenant_name")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!connection) {
    redirect("/reconcile");
  }

  // Load the full queue (for the desktop left-pane list)
  const queueItems = await loadQueueItems(supabase, platformTenantId, connection.xero_tenant_id);

  // Load transaction detail
  const { data: txn, error: txnError } = await supabase
    .from("xero_bank_transactions")
    .select(
      `id, description, date, total_cents, type, reference, bank_account_id, raw_json,
       transaction_rule_matches (
         id, suggestion_source,
         suggested_category_id, suggested_contact_id,
         suggested_project_id, suggested_tax_rate_id,
         action_applied, accepted_at, override_at, ai_model, ai_confidence,
         rule_id, rule_version_id, matched_at
       )`,
    )
    .eq("id", id)
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", connection.xero_tenant_id)
    .maybeSingle();

  if (txnError) throw txnError;
  if (!txn) notFound();

  const matches = (txn.transaction_rule_matches ?? []) as (RawMatch & {
    rule_id: string | null;
    rule_version_id: string | null;
    matched_at: string | null;
  })[];
  const match =
    matches.find((m) => m.suggestion_source === "rule") ??
    matches.find((m) => m.suggestion_source === "ai") ??
    null;

  // Resolve rule names for all matches that have a rule_id
  const ruleIds = [...new Set(matches.map((m) => m.rule_id).filter((id): id is string => Boolean(id)))];
  const ruleNameMap = new Map<string, string>();
  if (ruleIds.length > 0) {
    const { data: rules } = await supabase
      .from("rules")
      .select("id, name")
      .eq("platform_tenant_id", platformTenantId)
      .in("id", ruleIds);
    for (const rule of rules ?? []) {
      ruleNameMap.set(rule.id, rule.name);
    }
  }

  const allMatches: MatchHistoryRow[] = matches.map((m) => ({
    id: m.id,
    suggestion_source: m.suggestion_source,
    ruleName: m.rule_id ? (ruleNameMap.get(m.rule_id) ?? null) : null,
    ruleId: m.rule_id ?? null,
    matched_at: m.matched_at ?? m.accepted_at ?? new Date().toISOString(),
    action_applied: m.action_applied,
  }));

  // Compute prevId and nextId from queueItems
  const queueIndex = queueItems.findIndex((item) => item.id === id);
  const prevId = queueIndex > 0 ? queueItems[queueIndex - 1].id : null;
  const nextId = queueIndex >= 0 && queueIndex < queueItems.length - 1 ? queueItems[queueIndex + 1].id : null;

  // Resolve bank account name
  let bankAccountName: string | null = null;
  if (txn.bank_account_id) {
    const { data: acc } = await supabase
      .from("xero_accounts")
      .select("name")
      .eq("id", txn.bank_account_id)
      .eq("platform_tenant_id", platformTenantId)
      .maybeSingle();
    bankAccountName = (acc as { name?: string } | null)?.name ?? null;
  }

  // Resolve suggested category name
  let categoryName: string | null = null;
  let categoryCode: string | null = null;
  if (match?.suggested_category_id) {
    const { data: acc } = await supabase
      .from("xero_accounts")
      .select("name, code")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", connection.xero_tenant_id)
      .eq("xero_account_id", match.suggested_category_id)
      .maybeSingle();
    categoryName = acc?.name ?? null;
    categoryCode = acc?.code ?? null;
  }

  // Resolve suggested contact name
  let contactName: string | null = null;
  if (match?.suggested_contact_id) {
    const { data: contact } = await supabase
      .from("xero_contacts")
      .select("name")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", connection.xero_tenant_id)
      .eq("xero_contact_id", match.suggested_contact_id)
      .maybeSingle();
    contactName = (contact as { name?: string } | null)?.name ?? null;
  }

  // Load accounts and contacts for the override form
  const [{ data: accounts }, { data: contacts }] = await Promise.all([
    supabase
      .from("xero_accounts")
      .select("xero_account_id, name, code")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", connection.xero_tenant_id)
      .eq("status", "ACTIVE")
      .in("class", ["EXPENSE", "REVENUE"])
      .order("name"),
    supabase
      .from("xero_contacts")
      .select("xero_contact_id, name")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", connection.xero_tenant_id)
      .order("name")
      .limit(200),
  ]);

  const detail: DetailTransaction = {
    id: txn.id,
    description: txn.description,
    date: txn.date,
    total_cents: txn.total_cents,
    type: txn.type,
    reference: txn.reference,
    bankAccountName,
    match,
    categoryName,
    categoryCode,
    contactName,
  };

  return (
    <div
      className="flex flex-col md:flex-row md:overflow-hidden"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* Left pane — queue list (desktop only) */}
      <div className="hidden overflow-hidden md:flex md:w-[420px] md:flex-none md:border-r md:border-[var(--border)] md:flex-col">
        <QueueClient items={queueItems} selectedId={id} />
      </div>

      {/* Right pane — detail (full-width on mobile, flex-1 on desktop) */}
      <div className="flex-1 overflow-hidden">
        <DetailClient
          accounts={accounts ?? []}
          allMatches={allMatches}
          contacts={contacts ?? []}
          nextId={nextId ?? null}
          prevId={prevId ?? null}
          rawJson={(txn.raw_json as Record<string, unknown> | null) ?? null}
          transaction={detail}
        />
      </div>
    </div>
  );
}
