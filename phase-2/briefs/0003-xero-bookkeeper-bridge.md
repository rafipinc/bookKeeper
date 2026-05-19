# Brief 0003 — Phase 2: Xero Bookkeeper Bridge

**Status:** Draft
**Date:** 2026-05-18
**Author:** Rafi (with Claude planning support)
**Phase:** 2 (additive to Phase 1)

## Why

Phase 1 ships a manual ledger for solo operators logging their own income and expenses. That product stands. **Phase 2 adds an integrated Xero workflow** for an internal use case: a bookkeeping practice using the platform to assist with a client's books that already live in Xero.

The job-to-be-done in Phase 2 is the boring, repetitive part of bookkeeping that costs practices the most hours per client: looking at the bank feed in Xero, deciding what each line is, and reconciling it against a contact / account / category. The platform's role is to **suggest** the right categorisation using rules the bookkeeper has authored, and to **publish** the corresponding invoice or bill back to Xero when the data exists. Where Phase 1 is a notebook, Phase 2 is a co-pilot for the bookkeeper.

## What's in scope for v1

1. **Connect to Xero.** OAuth 2.0 confidential-client flow. One platform tenant connects to one or more Xero organisations. Tokens stored encrypted, refresh-token rotation handled, disconnect supported.
2. **Bank transaction viewer.** Mirror unreconciled bank transactions from connected Xero orgs into our Postgres so we can run rules and present a fast, filterable list to the bookkeeper.
3. **Rules engine.** UI-editable rules: conditions (description contains / amount range / account / contact) → action (suggest category / contact / project / tax rate). Suggest-only mode in v1. Versioned, with an audit log of which rule fired on which transaction.
4. **Invoice publishing.** Compose an `ACCREC` (sales) invoice in our UI; publish to Xero as `DRAFT` for review.
5. **Bill publishing.** Compose an `ACCPAY` (bill / purchase invoice) in our UI; publish to Xero as `DRAFT`. Optional receipt PDF attachment.

## What's explicitly NOT in scope for v1

- **Programmatic reconciliation of bank-feed lines.** Xero's API does not allow our app to mark a feed-imported statement line as reconciled. We suggest; the bookkeeper completes reconciliation either in Xero or via an invoice/bill we publish that Xero then auto-matches. See ADR-0011.
- **Auto-apply rules without review.** Rules in v1 always *suggest*; the bookkeeper accepts. Auto-apply is a v2 capability gated by trust earned via the audit log.
- **Bank Feeds API** (statement line ingestion). That's a separately-gated Xero product. We rely on whatever feed the client already has configured.
- **Multi-platform-user collaboration.** v1 is single bookkeeper per tenant. Roles and invitations come later.
- **Practice Manager / WorkflowMax / Xero HQ integrations.** Accounting API only.

## Why now / why this shape

Two business constraints drove the v1 cut:

- **One named client at launch.** Single-tenant in spirit but multi-tenant in schema, so onboarding client 2 is config-not-code (see ADR-0009).
- **Coding agents are implementing.** Spec, designs, and tickets must be precise enough that an autonomous agent (Codex or Claude Code) can execute without needing further clarification. Architectural ambiguity is resolved up front in ADRs rather than discovered mid-implementation.

## Driving constraints from research

The Xero API research (see specs/0003 §Reference) surfaced three hard constraints the spec must respect:

- Refresh tokens rotate on every exchange and expire after 60 days of inactivity → token-refresh path needs an advisory lock to prevent races.
- 60 API calls/min and 5,000/day **per Xero tenant** → background sync must throttle per tenant, not globally.
- Webhooks cover only Contacts / Invoices / CreditNotes / Subscriptions. Bank transactions need polling with `If-Modified-Since`.

## Success criteria

Phase 2 v1 is done when the named client's bookkeeper can:

1. Connect the client's Xero organisation in under 60 seconds.
2. Open the platform, see today's new unreconciled bank lines from Xero, and have rule-driven suggestions next to each.
3. Author a new rule in the UI, save it, and have it apply to the next sync without redeploying anything.
4. Compose an invoice or bill in the platform and have it appear as a `DRAFT` in Xero within 30 seconds.
5. Trust the audit log enough to one day flip a rule from `suggest` to `auto_apply`.

## Open questions for Rafi

- **Named client identity** — who's the v1 client, and do they have a sandbox Xero org we can develop against?
- **Receipt PDFs** — is the source of these emails, file uploads, or both? Affects ingestion design.
- **Whose practice email handles the OAuth consent** — the bookkeeper's or the client-owner's? Affects copy and consent screens.
- **AU/NZ/UK/US tax behaviour** — does the client need region-specific tax handling in v1, or is the first client homogeneous?
