function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

/**
 * Xero OAuth + API configuration. Values are read lazily so that build-time
 * imports (e.g. from middleware) don't crash when secrets are unset.
 */
export const xeroEnv = {
  get clientId() {
    return requireEnv("XERO_CLIENT_ID");
  },
  get clientSecret() {
    return requireEnv("XERO_CLIENT_SECRET");
  },
  get redirectUri() {
    return requireEnv("XERO_REDIRECT_URI");
  },
};

/** Scopes requested during the OAuth authorize step. */
export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
] as const;

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
