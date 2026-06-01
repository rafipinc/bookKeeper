import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

import { RulesClient, type RuleRow } from "./rules-client";

export default async function RulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: rules } = await supabase
    .from("rules")
    .select(
      "id, name, enabled, priority, rule_conditions(field, operator, value_json), rule_actions(action_type, value_json)",
    )
    .eq("platform_tenant_id", platformTenantId)
    .is("archived_at", null)
    .order("priority", { ascending: true });

  // Collect all category IDs from set_category actions so we can resolve names
  const categoryIds = new Set<string>();
  for (const rule of rules ?? []) {
    for (const action of rule.rule_actions) {
      if (action.action_type === "set_category") {
        const vj = action.value_json;
        const v =
          vj && typeof vj === "object" && !Array.isArray(vj) && "v" in vj
            ? (vj as Record<string, unknown>).v
            : vj;
        if (typeof v === "string") categoryIds.add(v);
      }
    }
  }

  // Resolve account names from xero_accounts (xero_account_id is the value stored)
  const categoryMap = new Map<string, string>();
  if (categoryIds.size > 0) {
    const { data: accounts } = await supabase
      .from("xero_accounts")
      .select("xero_account_id, name")
      .eq("platform_tenant_id", platformTenantId)
      .in("xero_account_id", [...categoryIds]);

    for (const account of accounts ?? []) {
      categoryMap.set(account.xero_account_id, account.name);
    }
  }

  // Enrich rule_actions with categoryName
  const enrichedRules: RuleRow[] = (rules ?? []).map((rule) => ({
    ...rule,
    rule_actions: rule.rule_actions.map((action) => {
      if (action.action_type === "set_category") {
        const vj = action.value_json;
        const v =
          vj && typeof vj === "object" && !Array.isArray(vj) && "v" in vj
            ? (vj as Record<string, unknown>).v
            : vj;
        const catName = typeof v === "string" ? categoryMap.get(v) : undefined;
        return { ...action, categoryName: catName };
      }
      return action;
    }),
  }));

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">Settings</p>
          <h1 className="mt-1 text-2xl font-semibold">Rules</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Automatically categorise transactions based on conditions you define.
          </p>
        </div>
        {enrichedRules.length > 0 ? (
          <Link
            className="bkp-button inline-flex h-10 items-center justify-center px-4 text-sm"
            href="/settings/rules/new"
          >
            Add rule
          </Link>
        ) : null}
      </div>

      <RulesClient rules={enrichedRules} />
    </section>
  );
}
