import { AlertTriangle } from "lucide-react";

import type { Database } from "@/lib/supabase/types";

type XeroConnection = Pick<Database["public"]["Tables"]["xero_connections"]["Row"], "xero_tenant_name" | "xero_tenant_id">;

export function ReauthBanner({ connection }: { connection: XeroConnection | null }) {
  if (!connection) {
    return null;
  }

  const orgName = connection.xero_tenant_name ?? connection.xero_tenant_id;

  return (
    <div className="border-b border-[#e4be63] bg-[#fff4d8] px-4 py-3 text-[var(--text-primary)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#8a5d00]" />
          <p className="text-sm">
            Your Xero connection to <span className="font-semibold">{orgName}</span> needs to be re-authorised. We can&apos;t sync until it&apos;s reconnected.
          </p>
        </div>
        <a className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--ink)] px-3 text-sm font-medium text-white" href="/api/xero/connect">
          Re-authorise
        </a>
      </div>
    </div>
  );
}
