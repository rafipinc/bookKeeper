import { IntegrationsClient } from "@/app/(app)/settings/integrations/integrations-client";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: connections } = await supabase
    .from("xero_connections")
    .select("id,xero_tenant_name,xero_tenant_id,status,created_at,scopes,last_synced_at")
    .eq("platform_tenant_id", platformTenantId)
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">Settings</p>
          <h1 className="mt-1 text-2xl font-semibold">Integrations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Connect Xero organisations, inspect sync access, and manage connection health.
          </p>
        </div>
        <a className="bkp-button inline-flex h-10 items-center justify-center px-4 text-sm" href="/api/xero/connect">
          Connect another organisation
        </a>
      </div>

      <IntegrationsClient connections={connections ?? []} />
    </section>
  );
}
