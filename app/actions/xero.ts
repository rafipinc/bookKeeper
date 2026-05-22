"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import { disconnectConnection } from "@/lib/xero/tokens";

async function getUserTenant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to manage Xero connections.");
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);
  return { supabase, platformTenantId };
}

export async function syncXeroConnection(connectionId: string) {
  const { supabase, platformTenantId } = await getUserTenant();

  const { data: connection, error } = await supabase
    .from("xero_connections")
    .select("id,xero_tenant_id,status")
    .eq("platform_tenant_id", platformTenantId)
    .eq("id", connectionId)
    .single();

  if (error || !connection) {
    throw new Error("Xero connection not found.");
  }

  if (connection.status !== "active") {
    throw new Error("Only active Xero connections can be synced.");
  }

  await inngest.send({
    name: "xero/tenant.sync.delta",
    data: {
      connectionId: connection.id,
      platformTenantId,
      xeroTenantId: connection.xero_tenant_id,
    },
  });

  revalidatePath("/settings/integrations");
}

export async function disconnectXeroConnection(connectionId: string) {
  const { supabase, platformTenantId } = await getUserTenant();

  const { data: connection, error } = await supabase
    .from("xero_connections")
    .select("id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("id", connectionId)
    .single();

  if (error || !connection) {
    throw new Error("Xero connection not found.");
  }

  await disconnectConnection(connection.id);

  revalidatePath("/settings/integrations");
  revalidatePath("/dashboard");
  revalidatePath("/ledger");
}
