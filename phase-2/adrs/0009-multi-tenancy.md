# ADR-0009 — Multi-tenancy: `platform_tenant_id` on every row, RLS predicate from session GUC

**Status:** Proposed
**Date:** 2026-05-18
**Supersedes:** Phase 1 implicit single-tenant assumption (`auth.uid()`-only RLS).

## Context

Phase 1's RLS was `auth.uid() = owner_id` — every row is owned directly by a user. That breaks the moment we add (a) a bookkeeping practice with multiple staff editing the same books, (b) a second end-client. Phase 2's first client is single-tenant in spirit, but the architecture must let us onboard client two without a re-platform.

Two patterns considered:

(a) **`platform_tenant_id` column on every domain table**, with an RLS predicate that reads the active tenant from a per-request session setting (`SET LOCAL app.current_tenant_id = ...`) plus a membership check. Industry-standard. Postgres-native. Cheap.

(b) **Schema-per-tenant.** Stronger isolation, more complex migrations, harder to operate at small scale. Worth it for hard regulatory boundaries; overkill for our v1.

Option (a) wins for v1.

## Decision

### New tables

```
platform_tenants (
  id uuid pk default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
)

platform_tenant_members (
  platform_tenant_id uuid not null references platform_tenants on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('admin','bookkeeper','viewer')),
  created_at timestamptz not null default now(),
  primary key (platform_tenant_id, user_id)
)
```

### Every domain table gains `platform_tenant_id uuid not null references platform_tenants`

This applies to Phase 1 tables (`businesses`, `categories`, `transactions`) and to every Phase 2 table (`xero_connections`, `xero_accounts`, `xero_contacts`, `xero_bank_transactions`, `xero_invoices`, `rules`, `rule_conditions`, `rule_actions`, `rule_versions`, `transaction_rule_matches`, `xero_webhook_events`, `xero_api_calls`).

### Per-request resolver

Server-side code (Next.js route handlers, Inngest functions) sets the active tenant before any tenant-scoped query:

```sql
SET LOCAL app.current_tenant_id = '<uuid>';
```

The resolver reads `platform_tenant_members` to verify the authenticated user has membership; if not, return 403 before any query runs.

### RLS predicate (applied to every domain table)

```sql
create policy tenant_isolation on <table>
  for all
  using (platform_tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (platform_tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

The `true` parameter on `current_setting` returns null if unset rather than erroring — null compared to a uuid returns null, which RLS treats as "row not visible". This means forgetting to `SET LOCAL` returns no rows rather than leaking everything, which is the safe failure mode.

### Phase 1 migration

A one-time migration:

1. Insert one `platform_tenants` row per existing Phase 1 user (slug = user's first-half-of-email).
2. Insert one `platform_tenant_members` row per existing user with role `admin`.
3. Add `platform_tenant_id` nullable to Phase 1 tables, backfill from the user's tenant, then `ALTER COLUMN … SET NOT NULL`.
4. Replace Phase 1 RLS policies with the tenant predicate above.

### UI surface

v1 surfaces zero multi-tenant UI — every authenticated user has exactly one tenant. The resolver returns the user's single tenant and `SET LOCAL`s it. When we onboard client two we either add a second user to a new tenant, or surface a tenant switcher.

## Consequences

**Positive**

- Adding a second tenant is config (insert two rows) not code.
- RLS-enforced isolation; no application-layer accidental leak path.
- Phase 1 stays operational through the migration with no UX change.

**Negative**

- Every query needs `SET LOCAL` (or a connection wrapper that does it). Easy to forget in a one-off script. Mitigation: wrap the Supabase client to require a tenant id before queries.
- One-time backfill migration must be defensive (handle users with zero rows, duplicate emails, etc.).

**Neutral**

- Schema-per-tenant remains available as a future option if a regulated client demands physical isolation. Migration path: a per-tenant `pg_dump | pg_restore` into a dedicated schema.
