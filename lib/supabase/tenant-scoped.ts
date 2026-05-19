import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

export type TenantScopedSupabaseClient = {
  platformTenantId: string;
  from: TypedSupabaseClient["from"];
  rpc: TypedSupabaseClient["rpc"];
  storage: TypedSupabaseClient["storage"];
  auth: TypedSupabaseClient["auth"];
};

function assertTenantId(platformTenantId: string) {
  if (!platformTenantId) {
    throw new Error("platformTenantId is required before running tenant-scoped queries.");
  }
}

export async function createTenantScopedClient(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
): Promise<TenantScopedSupabaseClient> {
  assertTenantId(platformTenantId);

  const { data, error } = await supabase
    .from("platform_tenant_members")
    .select("platform_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.platform_tenant_id) {
    throw new Error("Current user is not a member of the requested platform tenant.");
  }

  return {
    platformTenantId,
    from: supabase.from.bind(supabase),
    rpc: supabase.rpc.bind(supabase),
    storage: supabase.storage,
    auth: supabase.auth,
  };
}

export async function ensureUserPlatformTenant(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_user_platform_tenant", {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }

  assertTenantId(data);
  return data;
}
