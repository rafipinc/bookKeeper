import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { summarizeValue, xeroDebug, xeroError } from "@/lib/xero/debug";
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

  xeroDebug("callback_received", {
    url: request.nextUrl.pathname,
    hasCode: Boolean(code),
    code: summarizeValue(code),
    state: summarizeValue(state),
    scope: searchParams.get("scope"),
    sessionState: summarizeValue(searchParams.get("session_state")),
    providerError: oauthError,
  });

  if (oauthError) {
    xeroError("provider_returned_error", oauthError);
    return redirectToSettings("xero_denied");
  }

  if (!code || !state) {
    xeroDebug("callback_missing_params", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    return redirectToSettings("missing_params");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    xeroError("callback_user_lookup_failed", userError ?? "No authenticated Supabase user", {
      hasUser: Boolean(user),
    });
    return NextResponse.redirect(new URL("/login?next=/settings/integrations", baseUrl()));
  }

  xeroDebug("callback_user_resolved", {
    userId: user.id,
  });

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
    xeroError("state_lookup_failed", stateError, {
      userId: user.id,
      state: summarizeValue(state),
    });
    return redirectToSettings("state_lookup_failed");
  }

  if (!stateRow) {
    xeroDebug("state_mismatch", {
      userId: user.id,
      state: summarizeValue(state),
    });
    return redirectToSettings("state_mismatch");
  }

  xeroDebug("state_consumed", {
    platformTenantId: stateRow.platform_tenant_id,
    expiresAt: stateRow.expires_at,
  });

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    xeroDebug("state_expired", {
      platformTenantId: stateRow.platform_tenant_id,
      expiresAt: stateRow.expires_at,
    });
    return redirectToSettings("state_expired");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (error) {
    xeroError("token_exchange_failed", error, {
      platformTenantId: stateRow.platform_tenant_id,
      code: summarizeValue(code),
    });
    return redirectToSettings("token_exchange_failed");
  }

  let connections;
  try {
    connections = await fetchXeroConnections(tokens.access_token);
  } catch (error) {
    xeroError("connections_lookup_failed", error, {
      platformTenantId: stateRow.platform_tenant_id,
    });
    return redirectToSettings("connections_lookup_failed");
  }

  if (!connections.length) {
    xeroDebug("no_connections_returned", {
      platformTenantId: stateRow.platform_tenant_id,
    });
    return redirectToSettings("no_connections");
  }

  let encryptedAccessToken: string;
  let encryptedRefreshToken: string;
  try {
    [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
    ]);
  } catch (error) {
    xeroError("token_encryption_failed", error, {
      platformTenantId: stateRow.platform_tenant_id,
      connectionCount: connections.length,
    });
    return redirectToSettings("token_encryption_failed");
  }

  xeroDebug("tokens_encrypted", {
    platformTenantId: stateRow.platform_tenant_id,
    connectionCount: connections.length,
  });

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
    xeroError("xero_connections_upsert_failed", upsertError, {
      platformTenantId: stateRow.platform_tenant_id,
      connectionCount: rows.length,
      xeroTenantIds: rows.map((row) => row.xero_tenant_id),
    });
    return redirectToSettings("persist_failed");
  }

  const { data: persistedConnections, error: persistedConnectionsError } = await supabase
    .from("xero_connections")
    .select("id")
    .eq("platform_tenant_id", stateRow.platform_tenant_id)
    .in(
      "xero_tenant_id",
      rows.map((row) => row.xero_tenant_id),
    );

  if (persistedConnectionsError) {
    xeroError("xero_connections_post_upsert_lookup_failed", persistedConnectionsError, {
      platformTenantId: stateRow.platform_tenant_id,
      connectionCount: rows.length,
    });
    return redirectToSettings("persist_failed");
  }

  if (persistedConnections?.length) {
    await inngest.send(
      persistedConnections.map((connection) => ({
        name: "xero/tenant.sync.initial",
        data: {
          connectionId: connection.id,
        },
      })),
    );
  }

  xeroDebug("callback_completed", {
    platformTenantId: stateRow.platform_tenant_id,
    connectionCount: rows.length,
    xeroTenantIds: rows.map((row) => row.xero_tenant_id),
  });

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
