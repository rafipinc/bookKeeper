# ADR-0011 — Reconciliation scope: suggestion-only, no programmatic mark-as-reconciled

**Status:** Proposed
**Date:** 2026-05-18
**Driven by:** Discovery research, 2026-05-18.

## Context

The original Phase 2 framing was "view bank reconciliation in Xero and have the model automatically make assumptions". The natural reading of that is: our app reads the bank feed, applies rules, and marks the statement line as reconciled against the correct contact/account in Xero — automatically.

**Xero's API does not support this.** The discovery research surfaced consistent confirmation that:

- The `IsReconciled` field on `BankTransactions` can only be set to `true` when *creating* a `BankTransaction` in scenarios where there is **no bank feed connected** (i.e. you're recording a cash transaction directly).
- For feed-imported statement lines (the actual use case), the API has no surface for marking them reconciled against an invoice, bill, or contact. Reconciliation of feed lines is exclusively a Xero UI operation.
- Bank Rules defined in Xero itself are not exposed via API in either direction (read or write). A long-standing community ask Xero has declined.

Sources:
- https://developer.xero.com/documentation/api/accounting/banktransactions
- https://xero.uservoice.com/forums/5528-accounting-api/suggestions/2884040-reconcile-via-the-api
- https://xero.uservoice.com/forums/5528-xero-accounting-api/suggestions/36208999-bank-rules-in-the-api

This is a platform constraint, not a missing-feature-we-might-add. The original product framing must reshape around it.

## Decision

Phase 2 v1 implements **suggestion-driven reconciliation**, not automated reconciliation:

1. **We read what's unreconciled** from Xero (bank transactions with `IsReconciled=false`) and present them in our app.
2. **The rules engine suggests** category / contact / project / tax-rate per transaction.
3. **The bookkeeper accepts the suggestion** in our app — this records intent in our system but does *not* alter Xero's reconciliation state.
4. **For "create a matching entity"** scenarios (a SPEND line without a corresponding bill, or a RECEIVE line without an invoice), the bookkeeper triggers our **invoice/bill composer** to create the entity. Once we publish that entity to Xero as `DRAFT`, Xero's own reconciliation engine will auto-suggest matching it to the feed line when the bookkeeper approves the document in Xero's UI.
5. **The bookkeeper completes reconciliation in Xero.** Our app's value is shaving the *decision* time (what is this line? who's the contact? what category?), not the *click* time of reconciling.

### What this means in product copy

The product surface is described as **"suggest, prepare, publish"**, not **"reconcile"**:

- ❌ "Automate reconciliation"
- ✅ "Pre-process your bank feed before you reconcile"

### What we capture for audit

Every suggestion's `accepted_at` / `overridden_at` is recorded in `transaction_rule_matches`. Over time this dataset:

- Powers a "your acceptance rate per rule" UI — bookkeeper sees which rules they trust.
- Becomes the gating signal for graduating a rule from `suggest` → `auto_apply` in v2 (caveat: the `auto_apply` still only writes our suggestion to our DB and presents it; reconciliation still happens in Xero).
- Eventually trains a "rule recommender" — when no rule matches but the bookkeeper consistently categorises a similar transaction the same way, we surface "do you want a rule for this?".

## Consequences

**Positive**

- We respect the platform's actual API surface — no integration breakage when Xero deprecates a workaround.
- The bookkeeper remains the final approver, which is the correct posture for financial data anyway.
- The audit-log strategy (which rule fired, who accepted) is more useful than a black-box "Xero says this is reconciled" status.

**Negative**

- The product framing has to be re-pitched if anyone (including Rafi) was expecting "the AI reconciles for me". Mitigation: rename the screen "Pre-reconciliation queue" not "Reconciliation".
- Some bookkeepers will measure value against time-saved-clicking-Reconcile-in-Xero rather than decisions-made. We'll need to surface time-saved-on-decisions in the UI explicitly.

**Neutral**

- If Xero later adds a programmatic reconciliation API, we already have the data model to wire it up: a suggestion already accepted by the bookkeeper would become "auto-reconcile to Xero". Until then, the data model still works because the human-in-the-loop is mandatory.
