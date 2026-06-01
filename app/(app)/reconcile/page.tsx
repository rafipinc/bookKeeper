import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

import { loadQueueItems } from "./data";
import { ReconcileAssistant } from "./assistant-client";
import { QueueClient } from "./queue-client";

export default async function ReconcilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  // Look for the active Xero connection
  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id, xero_tenant_name, last_synced_at, status")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  // No active connection — show empty state
  if (!connection) {
    const { data: anyConnection } = await supabase
      .from("xero_connections")
      .select("status")
      .eq("platform_tenant_id", platformTenantId)
      .limit(1)
      .maybeSingle();

    const isReauth = anyConnection?.status === "reauth_required";

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="mb-2 text-base font-semibold text-[var(--text-primary)]">
          {isReauth ? "Xero connection needs re-authorization" : "No Xero connection found"}
        </p>
        <p className="mb-6 max-w-sm text-sm text-[var(--text-secondary)]">
          {isReauth
            ? "Re-authorize your Xero connection to see your bank feed here."
            : "Connect Xero in Setup → Connections to see your bank feed here."}
        </p>
        <Link
          className="rounded-[var(--radius-button)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ink-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          href="/settings/integrations"
        >
          Go to Connections
        </Link>
      </div>
    );
  }

  const items = await loadQueueItems(supabase, platformTenantId, connection.xero_tenant_id);

  // Caught-up empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="mb-2 text-base font-semibold text-[var(--text-primary)]">You&apos;re caught up</p>
        <p className="text-sm text-[var(--text-secondary)]">
          No unreconciled transactions.{" "}
          {connection.last_synced_at
            ? `Last synced ${new Date(connection.last_synced_at).toLocaleString()}.`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row md:overflow-hidden" style={{ height: "calc(100dvh - 3.5rem)" }}>
      {/* Left pane — transaction list (full-width on mobile, sidebar on desktop) */}
      <div className="flex-1 overflow-hidden md:w-[420px] md:flex-none md:border-r md:border-[var(--border)]">
        <QueueClient items={items} />
      </div>

      {/* Right pane — assistant on desktop; floating drawer on mobile */}
      <ReconcileAssistant />
    </div>
  );
}
