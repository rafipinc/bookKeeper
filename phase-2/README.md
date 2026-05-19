# Phase 2 — Xero Bookkeeper Bridge

**Status:** Planning complete; ready for coding agents.
**Date:** 2026-05-18
**Audience:** Codex CLI or Claude Code agents picking up implementation, and Rafi reviewing the plan.

## What this folder is

The complete planning bundle for Phase 2 of the Bookkeeping app — Xero-integrated workflow that adds to Phase 1's manual ledger, doesn't replace it. Everything a coding agent needs is in here or in Linear; no further clarification rounds with Claude required.

Move the contents into `~/Documents/Projects/agent-workflow/` to live alongside Phase 1's artefacts. Conventional layout:

```
agent-workflow/
├── briefs/
│   ├── 0002-bookkeeping-app-mvp.md            (Phase 1)
│   └── 0003-xero-bookkeeper-bridge.md         (Phase 2 — here)
├── specs/
│   ├── 0002-bookkeeping-app-mvp.md            (Phase 1)
│   └── 0003-xero-bookkeeper-bridge.md         (Phase 2 — here)
├── adrs/
│   ├── 0005-cash-basis-accounting-v1.md       (Phase 1)
│   ├── 0006-background-job-runner.md          (Phase 2 — here)
│   ├── 0007-xero-token-storage.md             (Phase 2 — here)
│   ├── 0008-rules-engine-condition-model.md   (Phase 2 — here)
│   ├── 0009-multi-tenancy.md                  (Phase 2 — here)
│   ├── 0010-branching-strategy.md             (Phase 2 — here)
│   └── 0011-reconciliation-scope-limit.md     (Phase 2 — here)
└── designs/
    ├── BKP-002.md, BKP-003.md, BKP-005.md     (Phase 1)
    └── 0003-screen-map.md                     (Phase 2 — here)
```

## TL;DR for a coding agent

You're shipping a Xero-integrated workflow on top of an existing Next.js 15 + Supabase + Vercel app. The product gains: connect-to-Xero, bank-transaction syncing, a rules engine that *suggests* (not auto-applies) categorisations, and composers that publish invoices and bills back to Xero. Single tenant in spirit at v1; the schema is multi-tenant from day one.

Read these files in this order before touching code:

1. `briefs/0003-xero-bookkeeper-bridge.md` — *why* we're building this.
2. `specs/0003-xero-bookkeeper-bridge.md` — *what* we're shipping, feature by feature, with acceptance criteria.
3. `adrs/0011-reconciliation-scope-limit.md` — **read this first among the ADRs.** It explains why "automated reconciliation" is reframed to "suggestion engine + invoice/bill publish". This is the most counter-intuitive constraint.
4. `adrs/0006-background-job-runner.md` — why Inngest, how to use it.
5. `adrs/0007-xero-token-storage.md` — token encryption + refresh-without-races.
6. `adrs/0008-rules-engine-condition-model.md` — rules engine schema.
7. `adrs/0009-multi-tenancy.md` — `platform_tenant_id` predicate everywhere.
8. `adrs/0010-branching-strategy.md` — GitHub Flow + the **never-merge-to-main-without-explicit-instruction** rule.
9. `designs/0003-screen-map.md` — screen-by-screen UI map.

Then go to Linear → [Bookkeeping App project](https://linear.app/rafaelpincus/project/bookkeeping-app-7473e212fd7b) and start with the first available ticket whose dependencies are resolved (see the dependency graph below).

## Hard rules

- **Never merge to `main` without explicit instruction from Rafi.** Branch protection enforces this in the repo, but the rule applies regardless of how you got here. Open the PR, post "Ready for review", stop. See ADR-0010.
- **No PKCE for OAuth.** Xero uses standard Authorization Code flow for confidential clients (server-side Next.js). See ADR-0007 + spec §Reference.
- **Webhooks only cover Contacts / Invoices / Credit Notes / Subscriptions.** Bank transactions need polling with `If-Modified-Since`. Don't waste a day looking for a bank-transaction webhook.
- **The API cannot mark feed-imported bank lines as reconciled.** Read ADR-0011. Don't promise users "we'll reconcile for you" anywhere in the product copy.
- **All Xero refresh-token operations need a Postgres advisory lock.** Concurrent refresh invalidates both tokens. See ADR-0007.

## Linear tickets (Phase 2)

20 tickets, all in the *Backlog* state. Click through to ticket pages for full descriptions.

### Foundation (do these first, in this order)

| Linear | Title | Labels |
|---|---|---|
| [RAF-18](https://linear.app/rafaelpincus/issue/RAF-18) | [BKP-008] Multi-tenant migration — platform_tenants + platform_tenant_id everywhere | data |
| [RAF-19](https://linear.app/rafaelpincus/issue/RAF-19) | [BKP-009] Inngest setup — durable background functions on Vercel | jobs, devops |
| [RAF-20](https://linear.app/rafaelpincus/issue/RAF-20) | [BKP-010] Xero data schema — connections, accounts, contacts, bank transactions, invoices | data |
| [RAF-41](https://linear.app/rafaelpincus/issue/RAF-41) | [BKP-027] GitHub Flow setup — branch protection, PR template, squash-merge enforcement | devops |

### Xero integration core

| Linear | Title | Labels |
|---|---|---|
| [RAF-21](https://linear.app/rafaelpincus/issue/RAF-21) | [BKP-011] Xero OAuth connect + callback flow | auth, backend, integration |
| [RAF-22](https://linear.app/rafaelpincus/issue/RAF-22) | [BKP-012] Token encryption + refresh with advisory lock | auth, backend, data |
| [RAF-23](https://linear.app/rafaelpincus/issue/RAF-23) | [BKP-013] Xero API client wrapper — rate limit, retries, per-tenant throttle | integration, backend |
| [RAF-24](https://linear.app/rafaelpincus/issue/RAF-24) | [BKP-014] Initial Xero sync job — bank accounts, contacts, tax rates, transactions | jobs, integration |
| [RAF-25](https://linear.app/rafaelpincus/issue/RAF-25) | [BKP-015] Delta Xero sync — 15-minute cron with If-Modified-Since | jobs, integration |
| [RAF-26](https://linear.app/rafaelpincus/issue/RAF-26) | [BKP-016] Xero webhook receiver — HMAC verify + dedup + fan-out | integration, backend, jobs |

### Rules engine

| Linear | Title | Labels |
|---|---|---|
| [RAF-27](https://linear.app/rafaelpincus/issue/RAF-27) | [BKP-017] Rules engine schema — rules, conditions, actions, versions, matches | data, rules-engine |
| [RAF-28](https://linear.app/rafaelpincus/issue/RAF-28) | [BKP-018] Rules evaluator job — snapshot-based, audit-trailed | rules-engine, jobs |
| [RAF-29](https://linear.app/rafaelpincus/issue/RAF-29) | [BKP-019] Rules editor UI — list + condition builder + actions | frontend, rules-engine |

### Pre-reconciliation surface

| Linear | Title | Labels |
|---|---|---|
| [RAF-30](https://linear.app/rafaelpincus/issue/RAF-30) | [BKP-020] Settings → Integrations — connect, disconnect, re-auth banner | frontend, auth |
| [RAF-31](https://linear.app/rafaelpincus/issue/RAF-31) | [BKP-021] Pre-reconciliation queue — transaction list with rule suggestions | frontend |
| [RAF-32](https://linear.app/rafaelpincus/issue/RAF-32) | [BKP-022] Transaction detail panel — accept / override / match history | frontend |

### Compose & publish

| Linear | Title | Labels |
|---|---|---|
| [RAF-37](https://linear.app/rafaelpincus/issue/RAF-37) | [BKP-023] Invoice composer + publish to Xero (ACCREC) | frontend, backend, integration |
| [RAF-38](https://linear.app/rafaelpincus/issue/RAF-38) | [BKP-024] Bill composer + receipt attachment + publish to Xero (ACCPAY) | frontend, backend, integration |

### Cross-cutting

| Linear | Title | Labels |
|---|---|---|
| [RAF-39](https://linear.app/rafaelpincus/issue/RAF-39) | [BKP-025] Tenant switcher topbar dropdown | frontend |
| [RAF-40](https://linear.app/rafaelpincus/issue/RAF-40) | [BKP-026] Audit log page — latest 100 Xero mutations | frontend, backend |

## Recommended execution order

A practical sequence that minimises blocked work and lets multiple coding agents work in parallel:

**Sprint 0 — repo hygiene (1 agent, ~half a day):**
BKP-027 (GitHub Flow setup). Do this concurrently with the very first foundation ticket so branch protection is on by the time anyone tries to merge.

**Sprint 1 — foundation (1 agent, sequenced):**
BKP-008 → BKP-009 → BKP-010. Everything else is blocked until these land. Single-threaded because they're all migrations and infra.

**Sprint 2 — Xero plumbing (1–2 agents, partial parallelism):**
BKP-011 + BKP-012 (auth flow + token mgmt — same person, tightly coupled) → BKP-013 (API client). BKP-017 (rules schema) can run in parallel with BKP-011/012 since it doesn't touch Xero.

**Sprint 3 — sync & evaluation (1–2 agents):**
BKP-014 (initial sync) → BKP-015 (delta cron) in sequence. BKP-016 (webhooks) and BKP-018 (rules evaluator) in parallel.

**Sprint 4 — UI layer (2–3 agents):**
BKP-020 (Settings), BKP-019 (Rules editor), BKP-021 + BKP-022 (queue + detail), BKP-023 (invoice), BKP-024 (bill), BKP-025 (tenant switcher) all parallelisable once the backend is in place.

**Sprint 5 — polish (1 agent):**
BKP-026 (audit log). Designed last because it depends on the audit data existing.

## Open questions (need Rafi's input before BKP-011 starts)

These are listed in the brief and spec; collecting here for visibility:

1. **Named v1 client** — who, and do they have a sandbox Xero org for development? - Configure this for demo account to start off with
2. **Receipt PDF source** — email-ingested, file-upload, or both? (BKP-024 designs for file-upload only in v1.) - File upload
3. **Whose practice email handles OAuth consent** — bookkeeper or client-owner? Affects copy. - Client owner
4. **Tax region** — AU/NZ/UK/US tax behaviour, or homogeneous v1 client? - AU
5. **Rules scope when bookkeeper has multiple connected orgs** — default to per-org or apply-to-all? - Per org
6. **Initial-sync UX** — banner, email when ready, or both? - Bannner to start off
7. **Receipt PDF cap** — 10 MB (proposed) vs Xero's 25 MB max? - Keep at 10mb

## What's NOT in this bundle

- Figma frames for Phase 2 screens — pending Figma MCP quota reset (see `bookkeeping_design.md` memory note). The `designs/0003-screen-map.md` markdown captures everything a coding agent needs.
- Phase 1 git repo — `~/Documents/Projects/bookkeeping-app` either doesn't exist yet or isn't mounted to my sandbox. BKP-001 (in Phase 1 backlog) still needs to land before any Phase 2 ticket can be implemented.
- Production secrets — XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_WEBHOOK_SIGNING_KEY must be registered in the Xero developer portal first, then added to Vercel env vars.

## Where to go from here

If you're Rafi: review the brief, spec, and the seven open questions. Once those are settled, ADR-0006 and ADR-0008 are the next things to validate — they're the most opinionated choices in the bundle.

If you're a coding agent: BKP-008 is the first ticket to claim. Read its description in Linear, confirm dependencies (BKP-004 from Phase 1 must be complete; if not, fall back to working on BKP-027 in the meantime). Open a PR, post "Ready for review", and **stop**.
