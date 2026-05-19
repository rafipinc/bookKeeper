# ADR-0006 — Background job runner: Inngest

**Status:** Proposed
**Date:** 2026-05-18
**Deciders:** Rafi (with planning agent input)

## Context

Phase 2 introduces several long-running, retry-prone, throttled units of work that cannot run inside a Vercel serverless function (which has hard execution-time limits and no first-class retry semantics):

- **Initial Xero sync** on connection: can take 5–30 minutes for a tenant with years of bank-transaction history.
- **Delta sync** every 15 minutes per connected tenant.
- **Webhook fan-out** — Xero webhook arrives, we must respond `200` within 5 seconds, then fetch the full resource from Xero.
- **Rules evaluation** per ingested transaction.
- **Invoice / bill publish** to Xero with retries on 429/5xx.

Each of these needs: durable execution, retries with backoff (respecting Xero's `Retry-After`), per-tenant concurrency throttling to fit Xero's 60-calls/minute, 5-concurrent-per-tenant rate limit, and an audit trail of every run.

Three options were assessed:

(a) **Supabase Edge Functions + `pg_cron` + a custom job table.** Cheap, no additional vendor. But we reinvent retry/backoff, fan-out, concurrency control, dead-letter queues, and replay UI from scratch — all of which the coding agents would then need to implement and maintain.

(b) **Inngest.** Durable functions on a hosted runtime that lives next to Vercel. First-class step memoisation (a 30-minute initial sync survives across many function invocations because each step is independently invoked and cached), retries with backoff, concurrency keys (set `concurrency: { key: 'event.data.xeroTenantId', limit: 4 }` and the platform throttles per tenant for us), event-driven fan-out, and a UI for inspecting/replaying runs.

(c) **Trigger.dev.** Similar to Inngest with similar capabilities. Either would work; Inngest has slightly better Vercel-native ergonomics today and a free tier sufficient for v1.

(d) **Upstash QStash.** A thin HTTP scheduler. We'd still need to model durable state, retries, and concurrency on top of it — closer to option (a) than option (b).

## Decision

Use **Inngest** for all background work in Phase 2:

- Initial sync, delta sync, webhook resource fetches, rules evaluation, invoice/bill publish, attachment upload.
- Define one Inngest app deployed alongside the Next.js app on Vercel.
- Per-tenant concurrency keyed on `xero-tenant-id`, limit 4 (one less than Xero's 5-concurrent cap, leaving headroom for user-triggered API calls).
- All scheduled jobs configured via Inngest's `cron` triggers; no `pg_cron`.
- Job state persists in Inngest's run history (canonical) plus a per-job summary row in our `xero_api_calls` table for joins with our own data.

## Consequences

**Positive**

- Long-running syncs survive Vercel's execution limits because each step is its own invocation.
- Per-tenant concurrency throttling is declarative.
- Retries and backoff handled by the platform; the coding agent doesn't need to implement them.
- A replay UI substantially reduces debugging cost during the first weeks of the integration.

**Negative**

- New vendor dependency (Inngest). Pricing tier may need upgrading once tenant count grows.
- Coding agents must learn Inngest's function-definition style. Mitigation: link the Inngest TypeScript quickstart in each affected ticket.
- Local dev needs Inngest's dev server running alongside `pnpm dev`.

**Neutral**

- If Inngest becomes a blocker (pricing, outage, dissatisfaction), the cutover to Trigger.dev is mostly a 1:1 API translation. Job logic is portable.
