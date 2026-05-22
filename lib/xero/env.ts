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

/**
 * Scopes requested during the OAuth authorize step.
 *
 * NOTE: This app was created after 2 March 2026, so it must use the new
 * granular scopes. The old broad scope `accounting.transactions` is not
 * available and causes Xero to return Error 500 during the OAuth flow.
 *
 * Granular replacements for `accounting.transactions`:
 *   - accounting.banktransactions  → bank transactions + transfers (core sync)
 *   - accounting.invoices          → invoices, credit notes, purchase orders
 *   - accounting.payments          → payments, batch payments, prepayments
 *
 * Unchanged scopes (not affected by the March 2026 change):
 *   - accounting.contacts          → contacts / vendors
 *   - accounting.settings          → chart of accounts, tax rates, currencies
 *
 * See: https://developer.xero.com/documentation/guides/oauth2/scopes/
 */
export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.contacts",
  "accounting.settings",
  "accounting.banktransactions",
  "accounting.invoices",
  "accounting.payments",
] as const;

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
