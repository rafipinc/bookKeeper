# ADR-0007 — Xero token storage: pgsodium + Supabase Vault, with advisory locks on refresh

**Status:** Proposed
**Date:** 2026-05-18

## Context

Xero issues OAuth access tokens (30-minute JWT) and refresh tokens (60-day, single-use, rotated on each exchange). A compromised refresh token grants full access to the connected Xero organisation until the user revokes it. Concurrent refresh attempts on the same connection invalidate both tokens — Xero treats parallel refreshes as a replay attack.

Three properties must be designed in:

1. **At-rest encryption** of refresh tokens (and ideally access tokens, though their 30-min lifetime is its own mitigation).
2. **No concurrent refresh** on the same `xero_connections` row.
3. **Rotation discipline** — every refresh persists the *new* token pair in the same transaction that uses it; partial writes leak tokens.

Options for at-rest encryption:

- **pgsodium with Supabase Vault** — Postgres-native column encryption using libsodium. The Vault stores a root key managed by Supabase; column keys are wrapped by the Vault key. Service role can decrypt; row owners cannot. Vault-key rotation is annual and is a re-wrap rather than a re-encrypt.
- **Application-layer envelope encryption with an external KMS** (AWS KMS, GCP KMS). More moving parts, IAM to manage, but key custody is independent of Supabase.
- **Plain-text in a "private" schema with restricted role grants.** Not encryption. Rejected.

For concurrent-refresh prevention, Postgres advisory locks (`pg_advisory_xact_lock(hashtext('xero_refresh:' || connection_id))`) give a cheap, per-connection mutex without external coordination.

## Decision

- **Encryption:** pgsodium + Supabase Vault for `xero_connections.encrypted_access_token` and `encrypted_refresh_token`. Service role (used by Inngest functions and server-side route handlers) is the only role that can decrypt. UI never sees decrypted tokens.
- **Schema:** `xero_connections (id uuid pk, platform_tenant_id uuid not null references platform_tenants, xero_tenant_id text not null, xero_tenant_name text, encrypted_access_token text not null, encrypted_refresh_token text not null, access_token_expires_at timestamptz not null, scopes text[] not null, status text not null default 'active', last_synced_at timestamptz, rotated_at timestamptz not null default now(), created_at timestamptz not null default now())`. Unique `(platform_tenant_id, xero_tenant_id)`.
- **Refresh flow (server-side, in a single function):**
  1. `BEGIN`
  2. `SELECT pg_advisory_xact_lock(hashtext('xero_refresh:' || $connection_id))`
  3. `SELECT decrypt(encrypted_refresh_token), access_token_expires_at, status FROM xero_connections WHERE id = $1 FOR UPDATE`
  4. If `access_token_expires_at` is still in the future (another worker beat us), `COMMIT` and use the existing token.
  5. Otherwise POST to Xero's token endpoint.
  6. On success: `UPDATE` with new encrypted token pair, expiry, `rotated_at = now()`.
  7. `COMMIT`.
  8. On `invalid_grant`: `UPDATE … SET status = 'reauth_required'`; alert.
- **Vault key rotation:** annual; documented in ops runbook (TBD).
- **Disconnect:** on user disconnect, call Xero's `DELETE /connections/{id}`, then `UPDATE … SET status = 'disconnected'`, then zero out `encrypted_access_token` / `encrypted_refresh_token` columns.

## Consequences

**Positive**

- No plaintext tokens in backups, logs, or pgdumps.
- Advisory lock prevents the most common Xero auth bug (parallel refresh).
- Single-transaction rotation prevents partial-write leaks.

**Negative**

- pgsodium operations are slow enough to matter at high throughput (each Xero call decrypts the access token). Mitigation: in-memory cache of decrypted access token, scoped per function invocation, expires when the JWT expires.
- Vault key recovery is a Supabase-managed responsibility — we don't control disaster recovery for it. Mitigation: documented re-auth procedure if a Vault key is ever lost; users would re-authorise from scratch.

**Neutral**

- If we later need to operate outside Supabase, envelope encryption with an external KMS becomes attractive. Migration would be a column-by-column re-encryption job.
