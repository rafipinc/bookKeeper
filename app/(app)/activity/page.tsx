import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

import { ActivityClient } from "./activity-client";
import { loadActivityEvents } from "./data";

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Activity</h1>
        <div className="bkp-card px-4 py-12 text-center">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Connect Xero to start tracking activity.
          </p>
          <Link
            className="rounded-[var(--radius-button)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ink-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            href="/settings/integrations"
          >
            Go to Integrations
          </Link>
        </div>
      </section>
    );
  }

  const events = await loadActivityEvents(supabase, platformTenantId, connection.xero_tenant_id);

  return <ActivityClient initialEvents={events} />;
}
