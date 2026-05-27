# Spec 0004 — AI-Assisted Bank Reconciliation Queue

**Status:** Draft
**Date:** 2026-05-27
**Phase:** 2 (builds on spec 0003 Feature 2 + Feature 3 foundations)
**Related:** ADR-0008 (rules engine model), ADR-0011 (suggestion-only scope), designs/0003-screen-map.md Screens 2–3

---

## Goal

The bookkeeper opens the app each day, sees a queue of unreconciled bank transactions, and for each one gets a suggestion (category, contact, project, tax rate) produced either by a deterministic rule *or* — when no rule fires — by an LLM. They tap **Accept** or correct the suggestion. That's it. The actual Xero reconciliation click still happens in Xero; our value is eliminating the *decision* time.

This spec covers the full queue experience end-to-end:
1. The rules engine schema + evaluator (BKP-017, BKP-018 — already scoped in spec 0003 Feature 3)
2. **The AI fallback suggestion service** — new work, the focus of this spec
3. The pre-reconciliation queue page and transaction detail panel (BKP-019 — screen implementation)
4. Accept / override flow with audit trail (part of BKP-019)

---

## Hard constraints (carry-over)

- **No programmatic reconciliation.** We never write `IsReconciled=true` to Xero. See ADR-0011.
- **Money in cents.** All `amount_cents` fields are `bigint`. Never floats.
- **RLS in Postgres**, not application code.
- **Cash basis.** One `date` per transaction. No obligation/settlement split.
- **Mobile-first.** Queue must be usable on a phone screen.

---

## Cards in delivery order

| Card | Title | Depends on |
|------|-------|------------|
| BKP-017 | Rules engine schema migration | BKP-015 (delta sync, done) |
| BKP-018 | Rules evaluator Inngest job | BKP-017 |
| BKP-026 | AI suggestion service | BKP-017 |
| BKP-019 | Pre-reconciliation queue page | BKP-018, BKP-026 |

---

## BKP-017 — Rules engine schema

Implement the DB migration for the rules engine tables as specified in ADR-0008:

- `rules`, `rule_conditions`, `rule_actions`, `rule_versions`, `transaction_rule_matches`
- RLS on all five tables scoped by `platform_tenant_id`
- Seed: no seed data required; tables start empty

**Acceptance criteria** (from ADR-0008 + spec 0003 Feature 3):

- Migration runs clean on a fresh Supabase branch.
- `pnpm test` passes with RLS isolation test: a row created under tenant A is invisible to a session with tenant B set.
- TypeScript types generated via `supabase gen types typescript`.

---

## BKP-018 — Rules evaluator Inngest job

An Inngest function that fires when a `xero_bank_transaction` is created or updated (event `xero/bank_transaction.created`).

**What it does:**

1. Loads the ordered, enabled ruleset snapshot for the relevant `platform_tenant_id` at job start (snapshot is frozen for the duration of the run).
2. Evaluates the transaction against rules in `priority` order using the flat-conditions model from ADR-0008 (AND within a group, OR across groups).
3. On first match: inserts a `transaction_rule_matches` row with `rule_id`, `rule_version_id`, `matched_at`, and the resolved suggestion payload (`suggested_category`, `suggested_contact`, `suggested_project`, `suggested_tax_rate`).
4. If no rule matches: emits event `xero/bank_transaction.no_rule_match` so BKP-026's AI service can pick it up.

**Acceptance criteria:**

- Unit tests cover: no rules, one matching rule, first-match-wins across multiple rules, AND/OR group logic.
- Job is idempotent: re-running for the same transaction replaces the existing match record rather than inserting a duplicate.
- Concurrency key: `xero-tenant-id` (cap 4, consistent with BKP-014/015).

---

## BKP-026 — AI suggestion service

This is the new work. When no deterministic rule matches a transaction, an LLM produces a suggestion the bookkeeper can accept with one tap.

### How the suggestion is generated

The model receives a structured prompt containing:

1. **Transaction facts**: description, amount (formatted as dollars, not raw cents), date, Xero bank account name, reference (if any).
2. **Tenant context** (few-shot signal): the 20 most-recently *accepted* suggestions for this tenant, grouped by suggested category — so the model can learn "for this business, 'Stripe' → Revenue / Stripe Payments" without being told explicitly.
3. **Available values**: the tenant's Xero chart of accounts (type `EXPENSE` or `REVENUE` based on debit/credit), active contacts list (truncated to 50 by fuzzy-match relevance against the description), tax rates.
4. **Task instruction**: produce one suggestion — category (account code + name), contact (Xero contact ID + name), confidence (0–1 float). Contact is optional; omit if unclear.

The model returns structured JSON. We use OpenAI function-calling / structured outputs so the response is guaranteed parseable. Model: `OPENAI_RECONCILIATION_MODEL` env var, defaulting to `gpt-4o-mini` (cheap; the prompt is not large).

### Schema additions

```sql
-- Extend transaction_rule_matches to accommodate AI suggestions
alter table transaction_rule_matches
  add column suggestion_source text not null default 'rule'
    check (suggestion_source in ('rule', 'ai')),
  add column ai_confidence numeric(3,2),     -- null for rule-sourced
  add column ai_model text;                  -- null for rule-sourced
```

When the AI service inserts a suggestion it sets `rule_id = null`, `rule_version_id = null`, `suggestion_source = 'ai'`, `ai_confidence`, `ai_model`.

### Inngest function

Listens to `xero/bank_transaction.no_rule_match`. Steps:

1. Fetch transaction + tenant chart of accounts + top-50 fuzzy-matched contacts + last-20 accepted suggestions.
2. Build prompt, call OpenAI with structured outputs.
3. Insert `transaction_rule_matches` row tagged `suggestion_source='ai'`.
4. On OpenAI error or malformed response: log, do not insert, do not retry (the queue will show "—" for this transaction, which is acceptable — the bookkeeper can manually override).

### Acceptance criteria

- Unit test: mock OpenAI call returns valid JSON → suggestion row inserted with correct fields.
- Unit test: OpenAI returns invalid JSON → no row inserted, no exception thrown.
- The prompt is capped at 6,000 tokens (chart of accounts + contacts are truncated before the limit is hit).
- `ai_confidence` is stored but not shown in the UI in v1 (reserved for v2 "trust score" feature).
- No PII logged: the prompt and response are not written to any persistent log.

---

## BKP-019 — Pre-reconciliation queue page

Implements Screen 2 and Screen 3 from `designs/0003-screen-map.md`.

### Routes

- `/reconcile` — queue list
- `/reconcile/[id]` — transaction detail (mobile full-screen; desktop slides into right pane)

### Queue list (`/reconcile`)

- Paginated table/card list of `xero_bank_transactions` where `is_reconciled = false` for the active tenant, ordered by `date desc`.
- Each row shows: date, description, amount (sage / terracotta), suggested category (from `transaction_rule_matches`), rule badge *or* "AI" badge, status pill (Pending / Accepted / Overridden).
- If a suggestion exists, an inline **Accept** button appears. Tapping it sets `action_applied = true`, `accepted_at = now()` on the match row and updates the transaction `status`.
- Summary bar: "N unreconciled · M with suggestions · K need attention".
- Filter: "All / Pending / Accepted / Overridden / No suggestion".

### Transaction detail (`/reconcile/[id]`)

- Shows full transaction facts, the suggestion block (category, contact, project, tax rate, source badge).
- **Accept** (primary): marks accepted.
- **Override** (secondary): inline form — category combobox (search Xero accounts), contact search, project picker, tax-rate picker, optional note. "Save override" writes `override_by_user_id` + `override_at` and sets the user-chosen values.
- **Skip** (ghost): leaves the row Pending.
- Rule-source suggestions show rule name (links to `/rules/[id]`). AI-source suggestions show "AI suggestion".
- "Raw Xero data" collapsible.

### Acceptance criteria

- Queue renders in < 500 ms for a tenant with 1,000 unreconciled transactions (Postgres index on `(platform_tenant_id, xero_tenant_id, date desc, is_reconciled)`).
- Accept and override actions are optimistic: UI updates immediately, server confirms asynchronously.
- RLS: the page 403s if the session user is not a member of the active `platform_tenant_id`.
- Mobile: single-pane list, tap → full-screen detail. "+" FAB for compose (Invoice / Bill).
- Empty states: no connection, caught-up, initial sync in progress (see designs/0003-screen-map.md Screen 2).

---

## Data flow summary

```
Xero delta sync (BKP-015)
  └─> xero_bank_transactions upsert
        └─> event: xero/bank_transaction.created
              ├─> Rules evaluator (BKP-018)
              │     ├─ rule matched → insert transaction_rule_matches (source='rule')
              │     └─ no match    → emit xero/bank_transaction.no_rule_match
              │                          └─> AI suggestion service (BKP-026)
              │                                └─ insert transaction_rule_matches (source='ai')
              └─> (no match, AI also fails) → transaction shows "—" in queue
```

---

## Out of scope (v1)

- `auto_apply` mode on rules — gate behind v2 when accept-rate data exists.
- Surfacing `ai_confidence` in the UI.
- "Create rule from this transaction" shortcut — v2.
- AI suggestions for transactions that *already* have a rule match — the deterministic rule wins.
- Bulk accept — v2.
- Accept-rate analytics dashboard — v2.

---

## Open questions (must resolve before BKP-026 implementation)

1. **Model selection**: `gpt-4o-mini` is the default. Should the model be configurable per tenant, or is one model for all tenants correct for v1?
2. **Prompt caching**: OpenAI prompt caching is automatic for repeated prefixes. The chart-of-accounts block will be stable across calls for the same tenant — no extra work needed, but worth confirming the token limit assumption once the chart is populated.
3. **Fallback when OpenAI is down**: current spec says "log and move on". Is that acceptable, or do we need a circuit breaker that pauses AI suggestions and shows a banner?
