import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { refreshTokens, revokeXeroConnection, XeroTokenEndpointError } from "@/lib/xero/oauth";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type XeroConnectionRow = Database["public"]["Tables"]["xero_connections"]["Row"];

type RefreshableConnection = Pick<
  XeroConnectionRow,
  | "id"
  | "platform_tenant_id"
  | "xero_tenant_id"
  | "encrypted_access_token"
  | "encrypted_refresh_token"
  | "access_token_expires_at"
  | "status"
>;

const REFRESH_SKEW_MS = 60_000;
const EMPTY_TOKEN = "";
const tokenCache = new Map<string, { accessToken: string; expiresAtMs: number }>();
const refreshFlights = new Map<string, Promise<string>>();

export class XeroReauthRequiredError extends Error {
  constructor(connectionId: string) {
    super(`Xero connection ${connectionId} requires re-authorisation.`);
    this.name = "XeroReauthRequiredError";
  }
}

export async function encryptToken(plain: string): Promise<string> {
  assertNonEmpty(plain, "plaintext token");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("xero_encrypt_token", { plain });

  if (error) {
    throw new Error(`Could not encrypt Xero token: ${error.message}`);
  }

  assertNonEmpty(data, "encrypted token");
  return data;
}

export async function decryptToken(cipher: string): Promise<string> {
  assertNonEmpty(cipher, "ciphertext token");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("xero_decrypt_token", { cipher });

  if (error) {
    throw new Error(`Could not decrypt Xero token: ${error.message}`);
  }

  assertNonEmpty(data, "decrypted token");
  return data;
}

export async function getAccessToken(connectionId: string): Promise<string> {
  assertNonEmpty(connectionId, "connectionId");

  const cached = tokenCache.get(connectionId);
  if (cached && cached.expiresAtMs - REFRESH_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  const existing = refreshFlights.get(connectionId);
  if (existing) {
    return existing;
  }

  const flight = getAccessTokenWithoutCache(connectionId).finally(() => {
    refreshFlights.delete(connectionId);
  });
  refreshFlights.set(connectionId, flight);
  return flight;
}

export async function disconnectConnection(connectionId: string): Promise<void> {
  assertNonEmpty(connectionId, "connectionId");
  const supabase = createServiceRoleClient();
  const connection = await fetchConnectionForRefresh(supabase, connectionId);

  if (connection.status === "reauth_required") {
    throw new XeroReauthRequiredError(connectionId);
  }

  if (connection.status === "disconnected") {
    return;
  }

  const accessToken = await getAccessToken(connectionId);
  await revokeXeroConnection(connection.xero_tenant_id, accessToken);

  const { error } = await supabase
    .from("xero_connections")
    .update({
      status: "disconnected",
      encrypted_access_token: EMPTY_TOKEN,
      encrypted_refresh_token: EMPTY_TOKEN,
    })
    .eq("id", connectionId);

  if (error) {
    throw new Error(`Could not mark Xero connection disconnected: ${error.message}`);
  }

  tokenCache.delete(connectionId);
}

async function getAccessTokenWithoutCache(connectionId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  await takeRefreshLock(supabase, connectionId);
  const connection = await fetchConnectionForRefresh(supabase, connectionId);

  if (connection.status === "reauth_required") {
    throw new XeroReauthRequiredError(connectionId);
  }

  if (connection.status !== "active") {
    throw new Error(`Xero connection ${connectionId} is not active.`);
  }

  if (isUsable(connection.access_token_expires_at)) {
    const accessToken = await decryptToken(connection.encrypted_access_token);
    cacheToken(connectionId, accessToken, connection.access_token_expires_at);
    return accessToken;
  }

  const refreshToken = await decryptToken(connection.encrypted_refresh_token);
  let refreshed;

  try {
    refreshed = await refreshTokens(refreshToken);
  } catch (error) {
    if (error instanceof XeroTokenEndpointError && error.isInvalidGrant) {
      await markReauthRequired(supabase, connectionId);
      await logTokenRefresh(supabase, connection, 400);
      throw new XeroReauthRequiredError(connectionId);
    }

    await logTokenRefresh(supabase, connection, error instanceof XeroTokenEndpointError ? error.status : null);
    throw error;
  }

  const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
    encryptToken(refreshed.access_token),
    encryptToken(refreshed.refresh_token),
  ]);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const { error: updateError } = await supabase
    .from("xero_connections")
    .update({
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      access_token_expires_at: expiresAt,
      status: "active",
      rotated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (updateError) {
    throw new Error(`Could not persist refreshed Xero token: ${updateError.message}`);
  }

  await logTokenRefresh(supabase, connection, 200);
  cacheToken(connectionId, refreshed.access_token, expiresAt);
  return refreshed.access_token;
}

async function takeRefreshLock(supabase: ServiceClient, connectionId: string) {
  const { error } = await supabase.rpc("xero_lock_connection_refresh", {
    connection_id: connectionId,
  });

  if (error) {
    throw new Error(`Could not acquire Xero refresh lock: ${error.message}`);
  }
}

async function fetchConnectionForRefresh(
  supabase: ServiceClient,
  connectionId: string,
): Promise<RefreshableConnection> {
  const { data, error } = await supabase
    .from("xero_connections")
    .select(
      "id,platform_tenant_id,xero_tenant_id,encrypted_access_token,encrypted_refresh_token,access_token_expires_at,status",
    )
    .eq("id", connectionId)
    .single();

  if (error || !data) {
    throw new Error(`Xero connection ${connectionId} not found.`);
  }

  return data;
}

async function markReauthRequired(supabase: ServiceClient, connectionId: string) {
  const { error } = await supabase
    .from("xero_connections")
    .update({ status: "reauth_required" })
    .eq("id", connectionId);

  if (error) {
    throw new Error(`Could not mark Xero connection reauth_required: ${error.message}`);
  }
}

async function logTokenRefresh(
  supabase: ServiceClient,
  connection: Pick<RefreshableConnection, "platform_tenant_id" | "xero_tenant_id">,
  status: number | null,
) {
  const { error } = await supabase.from("xero_api_calls").insert({
    platform_tenant_id: connection.platform_tenant_id,
    xero_tenant_id: connection.xero_tenant_id,
    endpoint: "/connect/token",
    method: "POST",
    status,
    retry_count: 0,
  });

  if (error) {
    console.error("[xero.tokens] failed to log token refresh", error);
  }
}

function cacheToken(connectionId: string, accessToken: string, expiresAt: string) {
  tokenCache.set(connectionId, { accessToken, expiresAtMs: new Date(expiresAt).getTime() });
}

function isUsable(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - REFRESH_SKEW_MS > Date.now();
}

function assertNonEmpty(input: string | null, label: string): asserts input is string {
  if (!input) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function clearTokenCacheForTests() {
  tokenCache.clear();
  refreshFlights.clear();
}
