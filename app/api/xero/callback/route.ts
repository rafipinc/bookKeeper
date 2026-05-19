import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchXeroConnections } from "@/lib/xero/oauth";
import { encryptToken } from "@/lib/xero/tokens";

export const dynamic = "force-dynamic";

/**
 * BKP-011: receive Xero's redirect, finish the Authorization Code exchange,
 * and persist one `xero_connections` row per granted tenant.
 *
 * Out of scope for this ticket: refresh-token rotation under advisory lock
 * (BKP-012) and the Settings → Integrations UI (BKP-020). On any failure we
 * redirect to /settings/integrations with a short error code so BKP-020 can
 * render an explanatory banner.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    console.error("[xero.callback] provider returned error", oauthError);
    return redirectToSettings("xero_denied");
  }

  if (!code || !state) {
    return redirectToSettings("missing_params");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login?next=/settings/integrations", baseUrl()));
  }

  // Verify (and atomically consume) the state row. RLS scopes this to the
  // current user, so a forged state belonging to another account is invisible.
  const { data: stateRow, error: stateError } = await supabase
    .from("xero_oauth_states")
    .delete()
    .eq("state", state)
    .eq("user_id", user.id)
    .select("platform_tenant_id, expires_at")
    .maybeSingle();

  if (stateError) {
    console.error("[xero.callback] state lookup failed", stateError);
    return redirectToSettings("state_lookup_failed");
  }

  if (!stateRow) {
    return redirectToSettings("state_mismatch");
  }

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return redirectToSettings("state_expired");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (error) {
    console.error("[xero.callback] token exchange failed", error);
    return redirectToSettings("token_exchange_failed");
  }

  let connections;
  try {
    connections = await fetchXeroConnections(tokens.access_token);
  } catch (error) {
    console.error("[xero.callback] connections lookup failed", error);
    return redirectToSettings("connections_lookup_failed");
  }

  if (!connections.length) {
    return redirectToSettings("no_connections");
  }

  const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
    encryptToken(tokens.access_token),
    encryptToken(tokens.refresh_token),
  ]);

  const accessTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const grantedScopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [];

  const rows = connections.map((c) => ({
    platform_tenant_id: stateRow.platform_tenant_id,
    xero_tenant_id: c.tenantId,
    xero_tenant_name: c.tenantName,
    encrypted_access_token: encryptedAccessToken,
    encrypted_refresh_token: encryptedRefreshToken,
    access_token_expires_at: accessTokenExpiresAt,
    scopes: grantedScopes,
    status: "active" as const,
    rotated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("xero_connections")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id" });

  if (upsertError) {
    console.error("[xero.callback] failed to upsert xero_connections", upsertError);
    return redirectToSettings("persist_failed");
  }

  const successUrl = new URL("/settings/integrations", baseUrl());
  successUrl.searchParams.set("connected", "1");
  return NextResponse.redirect(successUrl);
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
