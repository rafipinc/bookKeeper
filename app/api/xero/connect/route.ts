import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import { buildAuthorizeUrl, generateOAuthState } from "@/lib/xero/oauth";

export const dynamic = "force-dynamic";

/**
 * BKP-011: kick off the Xero OAuth Authorization Code flow.
 *
 *  1. require an authenticated Supabase session
 *  2. resolve the user's active platform tenant (auto-provision if missing)
 *  3. mint a CSRF-strength `state` value and persist it server-side
 *  4. 302 to Xero's authorize endpoint with the right scopes
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login?next=/settings/integrations", baseUrl()));
  }

  let platformTenantId: string;
  try {
    platformTenantId = await ensureUserPlatformTenant(supabase, user.id);
  } catch (error) {
    console.error("[xero.connect] failed to resolve platform tenant", error);
    return redirectToSettings("tenant_resolution_failed");
  }

  const state = generateOAuthState();
  const { error: insertError } = await supabase.from("xero_oauth_states").insert({
    state,
    user_id: user.id,
    platform_tenant_id: platformTenantId,
  });

  if (insertError) {
    console.error("[xero.connect] failed to persist oauth state", insertError);
    return redirectToSettings("state_persist_failed");
  }

  return NextResponse.redirect(buildAuthorizeUrl(state));
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

function redirectToSettings(errorCode: string): Response {
  const url = new URL("/settings/integrations", baseUrl());
  url.searchParams.set("error", errorCode);
  return NextResponse.redirect(url);
}
