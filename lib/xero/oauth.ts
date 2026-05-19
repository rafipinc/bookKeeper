import { randomBytes } from "crypto";

import {
  XERO_AUTHORIZE_URL,
  XERO_CONNECTIONS_URL,
  XERO_SCOPES,
  XERO_TOKEN_URL,
  xeroEnv,
} from "./env";

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
  return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const credentials = `${xeroEnv.clientId}:${xeroEnv.clientSecret}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}

export async function exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: xeroEnv.redirectUri,
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
    throw new Error(`Xero token exchange failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as XeroTokenResponse;
}

export async function fetchXeroConnections(accessToken: string): Promise<XeroConnection[]> {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(`Xero connections lookup failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as XeroConnection[];
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unavailable>";
  }
}
