import { randomBytes } from "crypto";

import {
  XERO_AUTHORIZE_URL,
  XERO_CONNECTIONS_URL,
  XERO_SCOPES,
  XERO_TOKEN_URL,
  xeroEnv,
} from "./env";
import { clientIdSuffix, summarizeValue, xeroDebug } from "./debug";

export type XeroTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
};

export type XeroConnection = {
  id: string;
  authEventId: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
  createdDateUtc: string;
  updatedDateUtc: string;
};

/** ≥32 random bytes encoded as URL-safe base64 (per the BKP-011 acceptance criteria). */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: xeroEnv.clientId,
    redirect_uri: xeroEnv.redirectUri,
    scope: XERO_SCOPES.join(" "),
    state,
  });

  xeroDebug("authorize_url_built", {
    clientIdSuffix: clientIdSuffix(xeroEnv.clientId),
    redirectUri: xeroEnv.redirectUri,
    scopes: XERO_SCOPES.join(" "),
    state: summarizeValue(state),
  });

  return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const credentials = `${xeroEnv.clientId}:${xeroEnv.clientSecret}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}

export async function exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
  const startedAt = Date.now();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: xeroEnv.redirectUri,
  });

  xeroDebug("token_exchange_started", {
    tokenUrl: XERO_TOKEN_URL,
    clientIdSuffix: clientIdSuffix(xeroEnv.clientId),
    redirectUri: xeroEnv.redirectUri,
    code: summarizeValue(code),
  });

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await safeText(response);
    xeroDebug("token_exchange_failed_response", {
      status: response.status,
      durationMs: Date.now() - startedAt,
      detail,
    });
    throw new Error(`Xero token exchange failed (${response.status}): ${detail}`);
  }

  const tokens = (await response.json()) as XeroTokenResponse;
  xeroDebug("token_exchange_succeeded", {
    durationMs: Date.now() - startedAt,
    tokenType: tokens.token_type,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
    hasAccessToken: Boolean(tokens.access_token),
    hasRefreshToken: Boolean(tokens.refresh_token),
    hasIdToken: Boolean(tokens.id_token),
  });

  return tokens;
}

export async function refreshTokens(refreshToken: string): Promise<XeroTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await safeText(response);
    throw new XeroTokenEndpointError(response.status, detail);
  }

  return (await response.json()) as XeroTokenResponse;
}

export async function fetchXeroConnections(accessToken: string): Promise<XeroConnection[]> {
  const startedAt = Date.now();
  xeroDebug("connections_lookup_started", {
    url: XERO_CONNECTIONS_URL,
    accessToken: summarizeValue(accessToken),
  });

  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await safeText(response);
    xeroDebug("connections_lookup_failed_response", {
      status: response.status,
      durationMs: Date.now() - startedAt,
      detail,
    });
    throw new Error(`Xero connections lookup failed (${response.status}): ${detail}`);
  }

  const connections = (await response.json()) as XeroConnection[];
  xeroDebug("connections_lookup_succeeded", {
    durationMs: Date.now() - startedAt,
    count: connections.length,
    tenants: connections.map((connection) => ({
      id: connection.id,
      tenantId: connection.tenantId,
      tenantName: connection.tenantName,
      tenantType: connection.tenantType,
    })),
  });

  return connections;
}

export async function revokeXeroConnection(connectionId: string, accessToken: string): Promise<void> {
  const response = await fetch(`${XERO_CONNECTIONS_URL}/${encodeURIComponent(connectionId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok && response.status !== 404) {
    const detail = await safeText(response);
    throw new Error(`Xero connection revoke failed (${response.status}): ${detail}`);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unavailable>";
  }
}

export class XeroTokenEndpointError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Xero token endpoint failed (${status}): ${detail}`);
    this.name = "XeroTokenEndpointError";
  }

  get isInvalidGrant(): boolean {
    if (this.status !== 400) {
      return false;
    }

    try {
      const parsed = JSON.parse(this.detail) as { error?: string };
      return parsed.error === "invalid_grant";
    } catch {
      return this.detail.includes("invalid_grant");
    }
  }
}
