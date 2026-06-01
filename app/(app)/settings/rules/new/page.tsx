import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

import { RuleEditorClient } from "../rule-editor-client";

export default async function NewRulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  // Get the active connection for xero_accounts
  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { data: accounts } = connection
    ? await supabase
        .from("xero_accounts")
        .select("xero_account_id, name, type, class")
        .eq("platform_tenant_id", platformTenantId)
        .eq("xero_tenant_id", connection.xero_tenant_id)
        .in("class", ["EXPENSE", "REVENUE"])
        .eq("status", "ACTIVE")
        .order("name", { ascending: true })
    : { data: [] };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">Settings / Rules</p>
        <h1 className="mt-1 text-2xl font-semibold">New rule</h1>
      </div>

      <RuleEditorClient accounts={accounts ?? []} />
    </section>
  );
}
