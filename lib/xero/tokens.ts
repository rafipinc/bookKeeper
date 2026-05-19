/**
 * Token encryption helpers.
 *
 * BKP-012 wires up real pgsodium + Supabase Vault encryption and the advisory-
 * lock-guarded refresh flow described in ADR-0007. Until that ticket lands we
 * still need a function we can call from BKP-011 (the connect/callback route)
 * so the integration boundary is fixed early.
 *
 * For now we wrap the token in a length-prefixed envelope that is clearly NOT
 * production-grade encryption. The format is deliberately distinct from
 * pgsodium output so a future migration can detect and re-encrypt legacy rows.
 */
const ENVELOPE_PREFIX = "stub:v1:";

function assertNonEmpty(input: string, label: string) {
  if (!input) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export async function encryptToken(plain: string): Promise<string> {
  assertNonEmpty(plain, "plaintext token");
  // TODO(BKP-012): replace with `select xero_encrypt_token($1)` RPC.
  const encoded = Buffer.from(plain, "utf8").toString("base64");
  return `${ENVELOPE_PREFIX}${encoded}`;
}

export async function decryptToken(cipher: string): Promise<string> {
  assertNonEmpty(cipher, "ciphertext token");
  if (!cipher.startsWith(ENVELOPE_PREFIX)) {
    // BKP-012 will write rows in a different format; treat them as opaque
    // and let the new helper handle decryption instead of guessing here.
    throw new Error("Token envelope not recognised by stub helper");
  }
  // TODO(BKP-012): replace with `select xero_decrypt_token($1)` RPC.
  return Buffer.from(cipher.slice(ENVELOPE_PREFIX.length), "base64").toString("utf8");
}
