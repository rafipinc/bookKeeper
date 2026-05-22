# Handoff to Claude Code

Last updated: 2026-05-22

## Where We Are

Phase 1 is complete. Phase 2 Xero integration is active on `develop`.

Localhost Xero OAuth is now working end to end:
- `/api/xero/connect` redirects to Xero with granular post-March-2026 scopes.
- `/api/xero/callback` exchanges the code, fetches Xero tenant connections, encrypts tokens through Supabase RPCs, and persists `xero_connections`.
- Rafi confirmed the local integration completed successfully on `http://localhost:3000`.

The final blocker was not Xero credentials or redirect URI configuration. The shell that launched `pnpm dev` had an inherited stale `SUPABASE_SERVICE_ROLE_KEY` (`keyLength: 41`) overriding `.env.local` (`keyLength: 219`). Restarting with inherited Supabase/Xero env vars cleared made Next load `.env.local` correctly.

## Shipped

### Phase 1 — MVP
- **RAF-11 / BKP-001** — Next.js 15 scaffold, TypeScript strict, Tailwind, shadcn/ui
- **RAF-12 / BKP-002** — Supabase magic-link auth
- **RAF-13 / BKP-003** — App shell
- **RAF-14 / BKP-004** — Core DB schema + RLS
- **RAF-15 / BKP-005** — First-signin business profile prompt
- **RAF-16 / BKP-006** — Default category seeding
- **RAF-17 / BKP-007** — Vercel deployment + environment config

### Phase 2 — Xero Integration
- **RAF-18 / BKP-008** — Multi-tenant migration
- **RAF-19 / BKP-009** — Inngest setup
- **RAF-20 / BKP-010** — Xero DB schema + RLS
- **RAF-21 / BKP-011** — Xero OAuth connect + callback routes
- **RAF-22 / BKP-012** — Token encryption, refresh, disconnect, and reauth-required handling
- **RAF-30 / BKP-020** — Settings → Integrations UI
- **RAF-42 / BKP-028** — Xero developer app registered and local env configured

## What Changed In The Latest Push

- Replaced the temporary token envelope with Supabase RPC-backed token encryption/decryption.
- Added token refresh with advisory lock RPC, in-process single-flight protection, refresh audit logging, and `invalid_grant` reauth handling.
- Updated disconnect to revoke the Xero connection and clear stored tokens.
- Added service-role Supabase client handling for server-side token operations.
- Added dev-safe Xero OAuth debug logs that redact codes/tokens.
- Added service-role key fingerprint logging in development to catch stale inherited env values without printing secrets.
- Updated Xero OAuth scopes to granular scopes:
  - `accounting.banktransactions`
  - `accounting.invoices`
  - `accounting.payments`
  - plus contacts/settings/openid/profile/email/offline_access
- Added/updated Supabase migrations and generated types for Xero token RPCs.
- Fixed the login redirect loop so signed-out users see the magic-link form.

## Verification

Already run locally:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Manual verification:
- Fresh Xero OAuth connect on localhost completed successfully and persisted connected organisations.

## Local Environment Notes

`.env.local` is configured at the repo root with Supabase and Xero credentials. `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` can remain blank until BKP-014 sync jobs are implemented.

Current local Xero env:
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback`
- Xero client ID ends in `95465E`.

If local OAuth fails with `token_encryption_failed`, check the dev-server terminal for:

```text
[supabase.service-role] using service key
```

Expected local fingerprint is:
- `keyLength: 219`
- `keyHash: 3f2c075618bc`
- `role: service_role`
- `ref: iaenvnkvwbotdtzxxpyc`

If the app logs `keyLength: 41` or no JWT payload metadata, the shell has a stale inherited `SUPABASE_SERVICE_ROLE_KEY`. Restart with inherited env vars cleared:

```bash
env -u SUPABASE_SERVICE_ROLE_KEY \
  -u NEXT_PUBLIC_SUPABASE_URL \
  -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
  -u NEXT_PUBLIC_APP_URL \
  -u NEXT_PUBLIC_SITE_URL \
  -u XERO_CLIENT_ID \
  -u XERO_CLIENT_SECRET \
  -u XERO_REDIRECT_URI \
  pnpm dev
```

## Next Work

Start with **RAF-23 / BKP-013**: Xero API client wrapper.

Expected scope:
- `lib/xero/client.ts`
- per-tenant rate limiting and retry behavior
- Xero tenant header handling
- logging rows to `xero_api_calls`
- usable by BKP-014 initial sync

Then continue to **RAF-24 / BKP-014**: initial Xero sync job.

## Per-Card Workflow

1. Read the Linear issue. Note the `spec:`, `design:`, `ADR:`, and `Depends on:` lines.
2. Open the referenced Phase 2 spec in `../agent-workflow/specs/0003-xero-bookkeeper-bridge.md`.
3. Open relevant ADRs, especially token storage, background jobs, multi-tenancy, and cash-basis accounting.
4. Implement only the card acceptance criteria.
5. Open a PR against `develop`. Title format: `[BKP-NNN] short description`.
6. After opening a PR, switch to `../agent-workflow/` and ask the Reviewer subagent to review the PR.

## Hard Constraints

- **Stack:** Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase, Vercel, pnpm.
- **Money:** `amount_cents bigint` only. Never floats. Never `numeric`.
- **RLS:** every user-data table has Postgres RLS. Never enforce access only in app code.
- **Cash basis:** one `date` column per transaction. No obligation/settlement split.
- **Mobile-first:** follow the design briefs.
- **Spec non-goals:** no invoicing, payroll, AR/AP, tax, multi-currency UI, or multi-business UI unless a later approved spec changes scope.
- **One card at a time:** implement only the active card's acceptance criteria.
