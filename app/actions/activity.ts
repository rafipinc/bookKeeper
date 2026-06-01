"use server";

import { loadActivityEvents, type ActivityEvent } from "@/app/(app)/activity/data";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export async function loadMoreActivity(cursor: string): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!connection) return [];

  return loadActivityEvents(supabase, platformTenantId, connection.xero_tenant_id, 50, cursor);
}
