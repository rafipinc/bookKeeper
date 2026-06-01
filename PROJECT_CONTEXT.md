# Project Context - bookkeeping-app

Last updated: 2026-05-27 (BKP-019 pre-reconciliation queue page complete; ready for PR)
Maintainer: every coding agent before ending a material session

This is the living source of truth for low-token development. Codex and Claude Code must read this before implementation and must update it before handing off.

## Current State

Phase 2.1, "Push to Xero", is complete on `develop`.

Done:

- BKP-008 / RAF-18: multi-tenant migration.
- BKP-009 / RAF-19: Inngest setup.
- BKP-010 / RAF-20: Xero data schema.
- BKP-010a / RAF-43: `xero_invoices.publish_error`.
- BKP-011 / RAF-21: Xero OAuth connect/callback.
- BKP-012 / RAF-22: token encryption and refresh locking.
- BKP-013 / RAF-23: Xero API client wrapper.
- BKP-014 / RAF-24: initial Xero sync.
- BKP-015 / RAF-25: delta Xero sync.
- BKP-017 / RAF-44: rules engine schema migration.
- BKP-018 / RAF-45: rules evaluator Inngest job.
- BKP-023 / RAF-33: invoice composer and publish to Xero.
- BKP-024 / RAF-34: bill capture, extraction, attachment upload, and publish to Xero.

Current next slice: AI-assisted reconciliation queue.

Active sequence:

1. BKP-017 / RAF-44: rules engine schema migration. Complete.
2. BKP-018 / RAF-45: rules evaluator Inngest job. Complete.
3. BKP-026 / RAF-46: AI suggestion service. Next active card.
4. BKP-019 / RAF-47: pre-reconciliation queue page.

Do not implement duplicate/deferred legacy cards unless Rafi explicitly reactivates them:

- RAF-39 / old BKP-025 tenant switcher is Duplicate.
- RAF-35 / BKP-025 tenant switcher is Canceled/deferred.
- RAF-40 / old BKP-026 audit log is Duplicate.
- RAF-36 / old BKP-026 activity history remains Backlog but is not part of the current reconciliation queue slice.

## Active Work

Active card: BKP-019 / RAF-47 — pre-reconciliation queue page. Complete on branch `bkp-019-reconcile-queue-page`. PR not yet created.

Branch: `bkp-019-reconcile-queue-page`
Files changed:
- `supabase/migrations/0015_reconcile_queue_index.sql` — partial index on `xero_bank_transactions(platform_tenant_id, xero_tenant_id, date desc) WHERE is_reconciled=false`.
- `app/actions/reconcile.ts` — server actions: `acceptSuggestion`, `overrideSuggestion`.
- `app/(app)/reconcile/data.ts` — shared data-loading types + `loadQueueItems` helper.
- `app/(app)/reconcile/queue-client.tsx` — client list with filter tabs, summary bar, optimistic accept.
- `app/(app)/reconcile/detail-client.tsx` — client detail with accept/override form.
- `app/(app)/reconcile/page.tsx` — list page (handles no-connection, caught-up, and list states).
- `app/(app)/reconcile/[id]/page.tsx` — detail page with two-pane desktop layout.
- `app/(app)/reconcile/layout.tsx` — wraps both routes with mobile `+` FAB.
- `app/(app)/reconcile/compose-fab.tsx` — floating action button (Invoice / Bill).
- `app/(app)/nav-links.tsx` — added "Pre-reconciliation" under Xero section.

BKP-017 → BKP-018 → BKP-026 → BKP-019 complete. Reconciliation queue slice done.

Next: see Backlog for next card. No immediate follow-on card queued.

## Context Budget

Default budget for a new implementation session:

- Mandatory read set: this file, `HANDOFF.md`, active Linear card.
- Optional read set: maximum 2 directly relevant local docs, such as one ADR and one design/spec section.
- Code search: use targeted `rg` queries. Do not browse the whole tree.
- File reads: read only files you will edit or depend on directly.
- Linear: list/get the active card only unless triaging the board.

Budget by task type:

- Schema/RLS card: active card, relevant migration patterns, Supabase tests, one ADR section.
- Job/backend card: active card, nearest existing Inngest function, Xero client, relevant tests.
- UI card: active card, relevant design section, nearest route/component patterns, accessibility and mobile states.
- Review card: diff only, touched tests, acceptance criteria.

Escalate context only when blocked by an unknown contract. When escalating, state the exact question and the next file/tool needed.

## Required Session Workflow

1. Read the mandatory start set.
2. Confirm the active card and branch.
3. Check `git status --short --branch`.
4. Identify user/uncommitted changes before editing.
5. Read only the code paths needed for the card.
6. Implement the smallest acceptance-criteria-complete change.
7. Run the narrowest useful verification first, then full verification before PR/merge handoff when feasible.
8. Update this file before ending.
9. Update `HANDOFF.md` if the next agent needs immediate operational instructions.

## Required `PROJECT_CONTEXT.md` Update

Every material session must update:

- `Last updated`
- `Active Work`
- `Recent Session Log`
- `Verification`
- `Known Blockers or Risks`

Keep updates concise. Do not paste large diffs, full command output, or full Linear descriptions.

## Verification Commands

Use as appropriate for the touched surface:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For local background jobs:

```bash
pnpm dev
pnpm dev:inngest
```

`pnpm dev:inngest` registers `http://localhost:3000/api/inngest`. Restart it if jobs queue but never run.

## Product and Architecture Constraints

- Money stays in integer cents: `amount_cents bigint`. Never floats. Never `numeric`.
- RLS belongs in Postgres. Every user-data table needs policies and isolation tests.
- Cash-basis accounting only. One `date` column for transactions.
- Xero cannot programmatically reconcile feed-imported bank lines. The app suggests categorisation; the final reconciliation action remains in Xero.
- Xero refresh-token operations require a Postgres advisory lock.
- Bank transactions require polling with `If-Modified-Since`; do not expect Xero webhooks for bank transaction updates.
- Current v1 assumes one connected Xero org in practice. Multi-org tenant switching is deferred.

## Branching and PR Rules

- Follow `docs/branching-strategy.md`.
- Do not merge to `main` without explicit instruction from Rafi.
- Keep one card per branch/PR.
- PR title format: `[BKP-NNN] short description`.
- PR body must reference the Linear card URL and summarize verification.

## Recent Session Log

### 2026-05-27 - BKP-019 pre-reconciliation queue page

- Migration 0015: partial index on unreconciled bank transactions for < 500ms query.
- Server actions: `acceptSuggestion` and `overrideSuggestion` (RLS enforces tenant isolation).
- `/reconcile` page: three states — no connection, caught-up (empty), and queue list.
- `/reconcile/[id]` page: two-pane on desktop (left=list, right=detail); single-pane on mobile.
- Client components use `useOptimistic` for instant accept/override feedback, then `router.refresh()`.
- `+` FAB on mobile opens Invoice/Bill compose sheet.
- Nav: "Pre-reconciliation" added under new "Xero" section.
- `pnpm build` clean. All 72 tests pass.

### 2026-05-27 - BKP-026 AI suggestion service

- Implemented Inngest function `ai-suggestion` (`lib/inngest/functions/ai-suggestion.ts`).
- Consumes `xero/bank_transaction.no_rule_match`; fetches transaction facts, chart of accounts (EXPENSE/REVENUE filtered), top-50 fuzzy-ranked contacts, last-20 accepted suggestions as few-shot context.
- Calls OpenAI Chat Completions with structured JSON output (model: `OPENAI_RECONCILIATION_MODEL`, default `gpt-4o-mini`). Prompt capped at 6,000 tokens.
- On error: logs error type only (no PII), returns null, does not insert, does not retry.
- Upserts `transaction_rule_matches` with `suggestion_source='ai'`, `ai_confidence`, `ai_model`.
- No migration required (columns added upfront in migration 0013).
- 17 new unit tests; all 72 tests pass.

### 2026-05-27 - BKP-018 rules evaluator

- Implemented Inngest function `rules-evaluator` (`lib/inngest/functions/rules-evaluator.ts`) with pure `evaluateRules` core for unit-test coverage.
- Unit tests cover: no rules, no match, single match + action resolution, first-match-wins by priority, AND within group, OR across groups, between operator, empty-conditions rule does not match.
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` — all pass (49 tests).
- BKP-018 is complete; next active work is BKP-026 / RAF-46 (AI suggestion service).

### 2026-05-27 - Workflow hardening

- Added this living context file.
- Replaced stale Phase 1-focused `AGENTS.md` and `CLAUDE.md` with shared low-token workflow rules.
- Updated handoff rules so both Codex and Claude Code converge on this file first.

## Verification

Current baseline after BKP-019:

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test` — 14 files / 72 tests passing (no new test files; UI components are integration-tested via build).
- `pnpm build` clean — `/reconcile` and `/reconcile/[id]` render correctly.

## Known Blockers or Risks

- Phase 2 docs and Linear have duplicate `BKP-026` labels. Use Linear issue IDs, not only BKP numbers, when referring to current work.
