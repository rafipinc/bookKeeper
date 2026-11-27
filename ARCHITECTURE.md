# Architecture — bookkeeping-app

> Onboarding document for an AI agent (or engineer) picking up this codebase.
> It describes the system as it exists on the `develop` branch today, not a target state.

## 1. What this product is

Fast bookkeeping for solo operators and microbusinesses. The user logs expenses
and revenue, connects their Xero accounting org, and the app helps them keep
their books current by **suggesting** how to categorize incoming bank
transactions. It also lets them compose invoices and bills and push them to Xero.

Key product constraints (these are hard rules, not preferences):

- **Money is always integer cents** stored in `amount_cents bigint` (and
  `total_cents`, `tax_cents`, etc.). Never floats, never SQL `numeric` for money.
- **Cash-basis accounting only.** Transactions have a single `date` column.
- **Mobile-first UI.** Target user is a non-technical business owner; copy avoids
  accountant jargon.
- **The app never auto-reconciles in Xero.** Xero's API cannot programmatically
  reconcile feed-imported bank lines. The app produces a *suggestion*; the final
  reconcile action stays in Xero. This is the central scope limit (ADR-0011).
- Out of scope unless an ADR + active card says otherwise: invoicing-beyond-Xero,
  payroll, AR/AP, tax filing, multi-currency, multi-business.

## 2. Tech stack

| Layer            | Choice                                                          |
|------------------|----------------------------------------------------------------|
| Framework        | Next.js 15 (App Router), React 19, TypeScript strict           |
| Styling / UI     | Tailwind CSS v4, shadcn/ui, `@base-ui/react`, lucide icons     |
| Auth / DB / Storage | Supabase (Postgres + Auth + Storage)                        |
| Background jobs  | Inngest (event-driven + cron functions)                        |
| External integration | Xero (OAuth2, accounting API)                             |
| AI               | OpenAI Chat Completions (structured JSON output)               |
| Hosting          | Vercel                                                          |
| Package manager  | pnpm                                                            |
| Tests            | Vitest (unit), Playwright (e2e)                                 |

## 3. Repository layout

```
app/                      Next.js App Router
  (app)/                  Authenticated app shell (route group)
    dashboard/            Overview
    ledger/               Manual transaction list
    reconcile/            AI-assisted reconciliation queue (list + [id] detail)
    activity/             Activity history feed
    compose/
      invoice/            Invoice composer
      bill/               Bill capture + composer
    settings/
      integrations/       Xero connect/disconnect
      rules/              Categorization rules editor
  actions/                Server actions ("use server"): auth, xero, rules,
                          reconcile, transactions, business, activity, demo
  api/                    Route handlers
    inngest/              Inngest serve endpoint (/api/inngest)
    xero/                 connect / callback / contacts
    invoices/, bills/     save-draft, publish, attachment upload-url, extract
  login/, auth/callback/  Magic-link auth flow
lib/
  supabase/               client.ts (browser), server.ts (SSR), service-role.ts,
                          tenant-scoped.ts, types.ts (generated), env.ts
  xero/                   oauth.ts, tokens.ts, client.ts, invoice-payload.ts,
                          composer-readiness.ts, env.ts
  inngest/
    client.ts             Inngest client config
    functions/            All background jobs + index.ts registry
  bills/                  extraction.ts (AI bill field extraction)
supabase/migrations/      Ordered SQL migrations 0001…0015 (source of truth for schema)
middleware.ts             Auth gate for protected routes
phase-2/                  specs, ADRs, designs, briefs (planning docs)
PROJECT_CONTEXT.md        Living source of truth — read before any work
HANDOFF.md                Operational next-steps for the next agent
CLAUDE.md / AGENTS.md     Shared agent working rules
```

## 4. Multi-tenancy and security model

This is the most important part of the architecture to internalize.

### Platform tenants

Every user belongs to one or more **platform tenants** (`platform_tenants`),
joined via `platform_tenant_members(platform_tenant_id, user_id, role)` where
role is `admin | bookkeeper | viewer`. On first business creation a tenant is
auto-provisioned (`ensure_user_platform_tenant`, slug derived from email).

All business data tables carry a `platform_tenant_id` column:
`businesses`, `categories`, `transactions`, and every `xero_*` table. Triggers
backfill `platform_tenant_id` on insert so application code rarely has to set it
manually.

> v1 assumes **one connected Xero org in practice**. Multi-org tenant switching
> is deliberately deferred (cards for it are Canceled/Duplicate).

### Row Level Security (RLS) is the enforcement boundary

**Authorization lives in Postgres, not application code.** Every user-data table
has RLS enabled with a policy of the form:

```sql
using (public.is_platform_tenant_member(platform_tenant_id))
with check (public.is_platform_tenant_member(platform_tenant_id))
```

`is_platform_tenant_member()` is a `security definer` function that checks
membership against `auth.uid()`. Child tables (`rule_conditions`, `rule_actions`,
`transaction_rule_matches`, etc.) enforce isolation by `EXISTS` joins back to
their parent. When adding any new user-data table, you **must** add RLS policies
and isolation tests — this is a hard rule.

### Three ways the app talks to the database

1. **Browser client** (`lib/supabase/client.ts`) — anon key, used in client
   components. Subject to RLS as the logged-in user.
2. **Server client** (`lib/supabase/server.ts`) — SSR/server-action client built
   from request cookies via `@supabase/ssr`. Runs as the authenticated user, so
   **RLS still applies**. Server actions (e.g. `app/actions/reconcile.ts`) use
   this and rely on RLS for tenant isolation rather than re-checking ownership in
   code — they only verify a user is present.
3. **Service-role client** (`lib/supabase/service-role.ts`) — uses
   `SUPABASE_SERVICE_ROLE_KEY`, **bypasses RLS**. Used only in background
   (Inngest) jobs where there is no user session. These jobs must scope every
   query manually with `platform_tenant_id` / `xero_tenant_id`. Never import the
   service-role client into request-handling/UI code paths.

`lib/supabase/tenant-scoped.ts` wraps a client and asserts the current user is a
member of the requested tenant before handing back a scoped accessor.

### Auth flow

- Magic-link auth (`app/login`, callback at `app/auth/callback`).
- `middleware.ts` refreshes the Supabase session cookie on every request and
  redirects unauthenticated users away from `/dashboard` and `/ledger` to
  `/login`. The matcher currently covers `/dashboard`, `/ledger`, and `/login`.

## 5. Data model (high level)

Schema is defined entirely in `supabase/migrations/` (ordered `0001`→`0015`).
Generated TypeScript types live in `lib/database.types.ts` / `lib/supabase/types.ts`.

**Core bookkeeping**
- `businesses` — owned by a user, belongs to a platform tenant.
- `categories` — income/expense, seeded with defaults on business creation.
- `transactions` — manual ledger entries; `amount_cents bigint`, single `date`.

**Xero mirror** (`0005`)
- `xero_connections` — one per connected Xero org. Holds **encrypted** access +
  refresh tokens, `access_token_expires_at`, `scopes`, and `status`
  (`active | reauth_required | disconnected`). Composite-keyed by
  `(platform_tenant_id, xero_tenant_id)`; most other xero tables FK to it.
- `xero_accounts` — chart of accounts (has `class` EXPENSE/REVENUE, `code`, etc.).
- `xero_contacts` — suppliers/customers.
- `xero_tax_rates`.
- `xero_bank_transactions` — imported bank lines. `is_reconciled` flag,
  `total_cents/tax_cents/subtotal_cents`, plus `user_overridden_at`/`_json`.
  This is what the reconciliation queue works against.
- `xero_invoices` — locally-composed invoices/bills (`type` ACCREC/ACCPAY) with a
  `status` lifecycle: `draft_local → publishing → published | publish_failed`,
  plus `publish_error` (`0012`) and attachment fields.
- `xero_webhook_events`, `xero_api_calls` — audit/observability tables.

**Rules engine** (`0013`, ADR-0008)
- `rules` — name, `priority` (lower = earlier), `enabled`, `mode`
  (`suggest | auto_apply`), versioned via `current_version_id`.
- `rule_conditions` — flat rows with a `group_id`: conditions in the same group
  are **AND**'d, separate groups are **OR**'d. Fields include `description`,
  `amount_cents`, `xero_account_id`, `contact_name`, `date`, `reference`;
  operators include `contains`, `equals`, `regex`, `between`, `gte`, `lte`, `in`,
  `starts_with`, `ends_with`. The AST is evaluated in the job, not in SQL.
- `rule_actions` — `set_category | set_contact | set_project | set_tax_rate`.
- `rule_versions` — immutable snapshots for audit/history.
- `transaction_rule_matches` — the suggestion record for a bank transaction.
  `suggestion_source` is `rule` or `ai`. Carries `suggested_category_id`,
  `suggested_contact_id`, etc.; AI rows also carry `ai_confidence` and `ai_model`.
  Accept/override is recorded via `action_applied`, `accepted_at`, `override_*`.

## 6. Background jobs (Inngest)

All jobs are defined in `lib/inngest/functions/` and registered in
`functions/index.ts`. They are served from the Next.js route `app/api/inngest/route.ts`
(`/api/inngest`) and deploy with the app on Vercel. The client
(`lib/inngest/client.ts`, app id `bookkeeping-app`) defaults to dev mode locally.

Registered functions:

| Function | Trigger | Purpose |
|----------|---------|---------|
| `helloPing` | event `app/hello.ping` | smoke test |
| `xeroTenantInitialSync` | event `xero/tenant.sync.initial` | first full pull of accounts/contacts/tax rates/bank txns for a connection |
| `xeroTenantDeltaSyncAll` | cron `*/15 * * * *` | fan-out: enqueue a delta sync per active connection |
| `xeroTenantDeltaSync` | event `xero/tenant.sync.delta` | incremental pull using `If-Modified-Since`; concurrency limited to 1 per `connectionId`, 5 retries. Redirects to initial sync if never synced. |
| `xeroInvoicePublish` | event | push a local invoice to Xero |
| `xeroBillPublish` | event | push a local bill (+ attachment) to Xero |
| `rulesEvaluator` | event `xero/bank_transaction.created` | evaluate rules against a new bank txn; emit `xero/bank_transaction.no_rule_match` if nothing matched |
| `aiSuggestion` | event `xero/bank_transaction.no_rule_match` | call OpenAI for a categorization suggestion |

### The reconciliation pipeline (the core flow)

```
Xero org
   │  (cron every 15 min)
   ▼
xeroTenantDeltaSyncAll ──fan-out──▶ xeroTenantDeltaSync (per connection)
                                         │  upserts xero_bank_transactions
                                         │  emits one event per NEW txn
                                         ▼
                              xero/bank_transaction.created
                                         │
                                         ▼
                                  rulesEvaluator
                            ┌────────────┴─────────────┐
                       rule matches               no match
                            │                          │
              writes transaction_rule_matches    emits xero/bank_transaction.no_rule_match
                 (suggestion_source='rule')               │
                                                           ▼
                                                     aiSuggestion
                                              calls OpenAI (structured JSON),
                                              writes transaction_rule_matches
                                                 (suggestion_source='ai',
                                                  ai_confidence, ai_model)
                                                           │
                                                           ▼
                                          /reconcile queue shows suggestion;
                                          user accepts / overrides (server action);
                                          user does final reconcile in Xero
```

Notes on `aiSuggestion` (`lib/inngest/functions/ai-suggestion.ts`):
- Builds context: the transaction, the chart of accounts filtered to EXPENSE or
  REVENUE based on SPEND/RECEIVE, top-50 fuzzy-ranked contacts, active tax rates,
  and the last 20 *accepted* suggestions as few-shot examples.
- Calls OpenAI with a strict `json_schema` response format. Model is
  `OPENAI_RECONCILIATION_MODEL` (default `gpt-4o-mini`). Prompt is capped at a
  ~6,000-token budget by character truncation.
- `retries: 0`. On any error it logs the error type only (no PII), returns null,
  and does **not** insert a row — failure is silent and non-blocking.
- Upserts on `(xero_bank_transaction_id, suggestion_source)`.

## 7. Xero integration internals

- **OAuth** (`lib/xero/oauth.ts`, routes under `app/api/xero/`): connect →
  callback stores an encrypted token pair in `xero_connections`.
- **Token storage & refresh** (`lib/xero/tokens.ts`, ADR-0007): access/refresh
  tokens are encrypted at rest via Postgres RPCs (`xero_encrypt_token` /
  `xero_decrypt_token`, pgsodium/Vault). `getAccessToken(connectionId)`:
  - serves from an in-process cache when unexpired (60s skew),
  - de-dupes concurrent refreshes with an in-flight promise map,
  - takes a **Postgres advisory lock** (`xero_lock_connection_refresh`) before
    refreshing to prevent concurrent refreshes across instances,
  - on `invalid_grant` marks the connection `reauth_required` and throws
    `XeroReauthRequiredError` (UI surfaces a reauth banner).
- **API client** (`lib/xero/client.ts`, ADR-0009/BKP-013): wraps Xero REST calls,
  supports `If-Modified-Since` (throws `XeroNotModifiedError` on 304), and logs
  calls to `xero_api_calls`.
- **Polling, not webhooks for bank txns**: Xero does not push bank-transaction
  updates reliably, so delta sync polls with `If-Modified-Since` on a 15-min cron.

## 8. AI usage summary

Two distinct AI features, both OpenAI Chat Completions with structured output:

1. **Reconciliation suggestions** — `lib/inngest/functions/ai-suggestion.ts`
   (model env `OPENAI_RECONCILIATION_MODEL`, default `gpt-4o-mini`).
2. **Bill field extraction** — `lib/bills/extraction.ts` invoked from
   `app/api/bills/extract`; extracts vendor/amount/date from uploaded bill docs
   (model env `OPENAI_BILL_EXTRACTION_MODEL`, default `gpt-5`). Attachments live
   in the `BILL_ATTACHMENTS_BUCKET` Supabase Storage bucket (default
   `xero-bill-documents`).

## 9. Frontend conventions

- App lives under the `(app)` route group with a shared authenticated layout and
  `nav-links.tsx`. Mobile-first.
- Server components load data; client components (`*-client.tsx`) handle
  interaction. The reconcile queue uses React `useOptimistic` for instant
  accept/override feedback, then `router.refresh()`.
- Mutations go through **server actions** in `app/actions/*` (`"use server"`),
  which call the cookie-based server Supabase client and `revalidatePath`.
- `/reconcile` renders three states: no Xero connection, caught-up (empty), and
  the queue list. Detail is two-pane on desktop, single-pane on mobile.

## 10. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # service-role; bypasses RLS; jobs only
NEXT_PUBLIC_APP_URL
XERO_CLIENT_ID
XERO_CLIENT_SECRET
XERO_REDIRECT_URI                  # must exactly match Xero app config
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
OPENAI_API_KEY
OPENAI_RECONCILIATION_MODEL        # default gpt-4o-mini
OPENAI_BILL_EXTRACTION_MODEL       # default gpt-5
BILL_ATTACHMENTS_BUCKET            # default xero-bill-documents
```

## 11. Local development & verification

```bash
pnpm install
pnpm dev            # Next.js; clears stale inherited Supabase/Xero env vars
pnpm dev:inngest    # second terminal: registers http://localhost:3000/api/inngest
```

If jobs queue but never run, restart `pnpm dev:inngest`.

Verification commands:

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest (unit)
pnpm build          # next build (also exercises route rendering)
pnpm test:e2e       # playwright
```

Unit tests sit next to source as `*.test.ts` (Xero client, tokens, rules
evaluator, AI suggestion, sync, invoice payload, bill extraction). UI components
are largely covered via `pnpm build`.

## 12. Workflow & process rules (important for an agent)

- `PROJECT_CONTEXT.md` is the **living source of truth**; `HANDOFF.md` holds the
  immediate next step. Read both before implementing.
- Work **one Linear card at a time** (`[BKP-NNN]` / `RAF-NN`); implement only that
  card's acceptance criteria. Don't refactor or add scope opportunistically.
- Prefer local repo evidence over older planning docs when they disagree.
- Feature branches target `develop`. **Never merge to `main` without explicit
  instruction.** One card per branch/PR. PR title format: `[BKP-NNN] short description`.
- Ask before changing architecture, product behavior, or accounting assumptions.

## 13. Where to read more

- `phase-2/adrs/` — architecture decisions: `0006` background runner (Inngest),
  `0007` Xero token storage, `0008` rules-engine condition model, `0009`
  multi-tenancy, `0011` reconciliation scope limit.
- `phase-2/specs/0004-ai-reconciliation-queue.md` — full reconciliation feature spec.
- `phase-2/designs/0003-screen-map.md` — screen map.
- `supabase/migrations/` — authoritative schema.
```
