import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import { summarizeValue, xeroDebug, xeroError } from "@/lib/xero/debug";
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
    xeroError("connect_user_lookup_failed", userError ?? "No authenticated Supabase user", {
      hasUser: Boolean(user),
    });
    return NextResponse.redirect(new URL("/login?next=/settings/integrations", baseUrl()));
  }

  let platformTenantId: string;
  try {
    platformTenantId = await ensureUserPlatformTenant(supabase, user.id);
  } catch (error) {
    xeroError("connect_tenant_resolution_failed", error, {
      userId: user.id,
    });
    return redirectToSettings("tenant_resolution_failed");
  }

  const state = generateOAuthState();
  xeroDebug("connect_state_generated", {
    userId: user.id,
    platformTenantId,
    state: summarizeValue(state),
  });

  const { error: insertError } = await supabase.from("xero_oauth_states").insert({
    state,
    user_id: user.id,
    platform_tenant_id: platformTenantId,
  });

  if (insertError) {
    xeroError("connect_state_persist_failed", insertError, {
      userId: user.id,
      platformTenantId,
      state: summarizeValue(state),
    });
    return redirectToSettings("state_persist_failed");
  }

  const authorizeUrl = buildAuthorizeUrl(state);
  xeroDebug("connect_redirecting_to_xero", {
    userId: user.id,
    platformTenantId,
  });

  return NextResponse.redirect(authorizeUrl);
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
