# Spec 0003 — Phase 2: Xero Bookkeeper Bridge

**Status:** Draft — pending review
**Date:** 2026-05-18
**Phase:** 2 (additive to Phase 1)
**Related:** briefs/0003-xero-bookkeeper-bridge.md, ADRs 0006–0011

## Reference: Xero API constraints driving this spec

Findings from the discovery research (see appendix at end of doc for full source URLs):

- **OAuth:** confidential-client Authorization Code flow, no PKCE for server-side apps. Scopes required: `accounting.transactions`, `accounting.contacts`, `accounting.settings`, `offline_access`, plus `openid profile email`.
- **Token rotation:** access tokens are 30-minute JWTs; refresh tokens rotate on each exchange (single-use), expire after 60 days of inactivity, with a ~30-minute grace window if a refresh response is lost. Concurrent refresh attempts on the same connection are unsafe — Xero invalidates both.
- **Rate limits:** 60 calls/minute, 5,000/day, 5 concurrent — **per Xero tenant**. App-wide cap is 10,000/min.
- **Reconciliation surface:** Bank Transactions and Bank Statements endpoints are *read*; the API cannot mark a feed-imported statement line as reconciled. Bank Rules defined inside Xero are not exposed via API.
- **Webhooks:** only Contacts, Invoices, Credit Notes, Subscriptions. Bank transactions and payments require polling with `If-Modified-Since`.
- **Webhook signing:** HMAC-SHA256 of raw request body with the app's webhook signing key, base64-encoded, in `x-xero-signature`. Must respond `200` within 5 seconds.
- **Multi-tenancy:** `GET /connections` returns all authorised Xero orgs; every API call carries an `xero-tenant-id` header naming the org.

## Feature 1 — Connect to Xero

### Acceptance criteria

- Given a platform user, when they click "Connect Xero" in Settings, then they're redirected to Xero's consent screen with `client_id`, `redirect_uri`, the scopes listed in the reference section above, and a CSRF `state` value that the server stores against the user's session.
- Given Xero redirects back to `/api/xero/callback`, then the server verifies `state`, exchanges the code for tokens at `https://identity.xero.com/connect/token`, calls `GET https://api.xero.com/connections` to enumerate the authorised orgs, and persists one `xero_connections` row per org with encrypted access + refresh tokens, expiry, and granted scopes.
- Given a user with one or more existing connections, when they visit Settings → Integrations, then they see a list of connected Xero orgs with org name, connected-on date, granted scopes, and a "Disconnect" action.
- Given a user clicks "Disconnect" on a connection, then the server calls `DELETE https://api.xero.com/connections/{id}`, marks the local row `status='disconnected'`, and reschedules no further sync jobs against that connection.
- Given an access token has expired, then the next outbound Xero call acquires a Postgres advisory lock on `xero_connections.id`, refreshes the token pair, persists the new pair in one transaction, and proceeds — without a second concurrent worker also calling refresh.
- Given a refresh fails with `invalid_grant`, then the connection is marked `status='reauth_required'`, all scheduled jobs against it are cancelled, and a re-auth banner is surfaced in the UI.

### Out of scope (this feature)

- Switching Xero orgs mid-session — defer to Settings → Integrations dropdown in Feature 6.
- Granular scope downgrades — request the full v1 scope set every time.

## Feature 2 — Bank transaction sync

### Acceptance criteria

- Given a newly-connected Xero org, when the connect callback completes, then a `xero.tenant.sync.initial` job is enqueued for that connection.
- Given the initial sync runs, then it paginates `GET /BankTransactions?where=Status=="AUTHORISED"` and `GET /Accounts?where=Type=="BANK"`, upserts into local `xero_accounts` and `xero_bank_transactions`, and writes the most-recent `UpdatedDateUTC` seen into `xero_connections.last_synced_at`.
- Given an existing connection, every 15 minutes a `xero.tenant.sync.delta` job is enqueued via cron. The job calls Xero with `If-Modified-Since: <last_synced_at>` and upserts only changed rows.
- Given the sync detects a row our user has overridden (`xero_bank_transactions.user_overridden_at is not null`), then user-edited fields are preserved and only the raw payload + non-overridden fields are updated.
- Given a sync hits Xero's `429`, then Inngest's retry-with-backoff respects the `Retry-After` header.
- Given a Xero webhook arrives for a Contact, Invoice, or Credit Note, then the webhook handler verifies the HMAC signature against the raw body, returns `200` within 1 second, enqueues a per-resource fetch job, and dedups against `xero_webhook_events.event_id`.
- Concurrency: per-tenant concurrency key on Inngest = `xero-tenant-id`, capped at 4 simultaneous in-flight Xero requests per tenant (under Xero's 5-concurrent cap).

### Out of scope (this feature)

- Real-time push of bank transactions — Xero doesn't expose this.
- Backfill earlier than the bank feed's start date.

## Feature 3 — Rules engine

### Acceptance criteria

- Given a user with `role='admin'` or `role='bookkeeper'`, when they open Rules, then they see all rules for their platform tenant ordered by `priority` ascending, with name, condition summary, action, mode (`suggest`/`auto_apply`), enabled/disabled, and last-fired stats.
- Given the user creates a new rule, then they specify: a name, one or more conditions grouped by AND/OR, one or more actions (`set_category`, `set_contact`, `set_project`, `set_tax_rate`), a `mode` (default `suggest`), and an `enabled` flag. On save the rule is written with `priority` appended to end of list.
- Given a rule exists, the user can reorder it (drag, or up/down) which updates `priority`. Conflicts resolved server-side.
- Given a rule is edited, then a new row is written to `rule_versions` with a JSON snapshot of conditions+actions; the rule's `current_version_id` advances. Older versions remain queryable.
- Given a sync ingests a new `xero_bank_transactions` row, then the rules evaluator (also an Inngest function) takes a snapshot of the ordered, enabled ruleset at job start, evaluates the row against rules in `priority` order, records a `transaction_rule_matches` row for every match (rule, version, time), and stops at the first matching rule in `suggest` mode. (`auto_apply` is deferred — see Out of scope.)
- Given a user opens a bank transaction with a match, then the suggested category/contact appears alongside the rule name, with one-click "accept" (writes user override to the row) or "override" (sets a different value).
- Given a user overrides a suggestion, then the `transaction_rule_matches.override_by_user_id` + `override_at` are set, and the rule's "accept rate" metric updates.
- RLS: every rules table is scoped by `platform_tenant_id = current_setting('app.current_tenant_id')::uuid` and gated by membership.

### Out of scope (this feature)

- `auto_apply` mode — gate behind v2 once accept rates earn trust.
- Cross-tenant rule sharing or templates.
- Machine-learned suggestions (no rule match) — v2.

## Feature 4 — Invoice publishing (ACCREC)

### Acceptance criteria

- Given a user with role admin/bookkeeper, when they click "New invoice", then a composer opens with fields: contact (search-then-select against `xero_contacts`), line items (description, quantity, unit amount, account code from `xero_accounts` of type REVENUE, tax rate from `xero_tax_rates`), date, due date, reference, optional invoice number.
- Given the user clicks "Save draft", then a row is written to `xero_invoices` with `status='draft_local'`, `type='ACCREC'`, the line items snapshot, and `published_to_xero_at=null`.
- Given a draft exists, when the user clicks "Publish to Xero", then a `xero.invoice.publish` job is enqueued. The job posts to `POST /Invoices` with `Status='DRAFT'`, stores the returned `InvoiceID` and `InvoiceNumber`, and sets `status='published'` + `published_to_xero_at`.
- Given an attachment was uploaded with the invoice, then after publish the job calls `POST /Invoices/{InvoiceID}/Attachments/{filename}` with the file bytes and correct `Content-Type`.
- Given the publish job fails with a 4xx, then the row stays `status='draft_local'`, the error is surfaced to the user, and no retry is attempted.
- Given the publish job fails with a 5xx or 429, then Inngest retries with backoff up to 5 times before marking `status='publish_failed'` and alerting.

### Out of scope (this feature)

- Sending the invoice to the customer (email-from-Xero) — out of scope; bookkeeper does this in Xero.
- Editing a published invoice — round-trip the user back to Xero.
- Recurring invoices.

## Feature 5 — Bill publishing (ACCPAY)

Same as Feature 4 with `type='ACCPAY'`, account codes filtered to type EXPENSE, and the additional ability to ingest a receipt PDF as a primary attachment.

### Acceptance criteria

- All criteria of Feature 4 hold with `Type='ACCPAY'`.
- Given the user uploads a receipt PDF (≤25 MB, `application/pdf`) in the composer, then it's stored in Supabase Storage under `tenant/{platform_tenant_id}/bills/{bill_id}/{filename}` and the path is recorded on `xero_invoices.attachment_path`.
- Given a bill publishes successfully, then the attachment is posted to Xero in a follow-up job using the path above. If attachment-post fails, the bill is published but `xero_invoices.attachment_status='failed'` and the user is shown a retry option.

### Out of scope (this feature)

- Email ingestion → bill (forward `bill@<tenant>.app.example.com`). v2.
- OCR / line-item extraction from receipt PDF. v2.

## Feature 6 — Settings & Xero tenant switcher

### Acceptance criteria

- Given a user has multiple connected Xero orgs, when they view any Xero-aware screen (bank transactions, rules, invoice composer, bill composer), then a tenant switcher dropdown in the topbar selects which org is in scope. Selection persists per user session in `localStorage` and is sent on every API call as `?tenantId=<uuid>`.
- Given a user has zero connected orgs, then Xero-aware screens render an empty state pointing back to Settings → Integrations.
- Given a user selects a tenant, then the server resolver verifies the user has membership of the corresponding `platform_tenant_id` and short-circuits with 403 if not.

### Out of scope (this feature)

- Per-tenant user roles different from platform roles — v2.

## Non-functional requirements

- **Performance:** bank-transactions list renders in <500ms for tenants with up to 10k transactions (Postgres index on `(platform_tenant_id, xero_tenant_id, date desc)`).
- **Availability:** target 99% for synchronous endpoints. Background jobs (Inngest) are eventually consistent; UI shows "syncing" state when `xero_connections.last_synced_at` is older than 30 min.
- **Security:** Xero refresh tokens encrypted at rest with pgsodium + Supabase Vault. Webhook bodies verified for HMAC signature. All Xero-aware routes require `auth.uid()` plus `platform_tenant_id` membership.
- **Observability:** every Xero API call logs `{platform_tenant_id, xero_tenant_id, endpoint, status, ms, retry_count}` to a `xero_api_calls` table. Inngest run history is the canonical job log.

## Schema additions (summary)

New tables introduced by Phase 2:

- `platform_tenants`, `platform_tenant_members`
- `xero_connections` (encrypted tokens)
- `xero_accounts`, `xero_contacts`, `xero_tax_rates` (local mirrors of Xero references)
- `xero_bank_transactions` (with `raw_json`, `user_overridden_at`)
- `xero_invoices` (composer drafts + publish status, both ACCREC and ACCPAY)
- `rules`, `rule_conditions`, `rule_actions`, `rule_versions`, `transaction_rule_matches`
- `xero_webhook_events` (dedup table)
- `xero_api_calls` (observability)

All Phase 1 tables (`businesses`, `categories`, `transactions`) gain a `platform_tenant_id` column with a one-time migration. See ADR-0009.

## Open questions

- Q1: Do we cache Xero contact list locally, or query live each composer-open? (Performance vs. staleness — proposal: cache, refresh on webhook.)
- Q2: How do we surface the first-run "30-minute initial sync" experience? Banner? Email-when-ready?
- Q3: When the bookkeeper has multiple connected orgs and authors a rule, does the rule apply across orgs by default, or scoped to one? (Proposal: scoped, with an opt-in "apply to all my orgs" toggle.)
- Q4: Receipt PDF size — Xero caps at 25 MB. Do we enforce a tighter cap (e.g. 10 MB) for cost / latency reasons?

## Appendix — Xero discovery sources

Pulled from research on 2026-05-18:

- Xero OAuth 2.0 auth flow: https://developer.xero.com/documentation/guides/oauth2/auth-flow/
- Xero OAuth scopes: https://developer.xero.com/documentation/guides/oauth2/scopes/
- Bank Transactions endpoint: https://developer.xero.com/documentation/api/accounting/banktransactions
- Bank Statements endpoint: https://developer.xero.com/documentation/api/accounting/bankstatements
- Invoices endpoint: https://developer.xero.com/documentation/api/accounting/invoices
- Attachments endpoint: https://developer.xero.com/documentation/api/accounting/attachments
- Webhooks overview: https://developer.xero.com/documentation/guides/webhooks/overview/
- API rate limits: https://developer.xero.com/documentation/guides/oauth2/limits/
- Connections (multi-tenancy): https://developer.xero.com/documentation/guides/oauth2/tenants
