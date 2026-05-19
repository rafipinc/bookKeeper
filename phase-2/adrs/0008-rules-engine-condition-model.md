# ADR-0008 — Rules engine condition model: flat conditions + group_id, evaluator-side AST

**Status:** Proposed
**Date:** 2026-05-18

## Context

The rules engine (spec 0003 Feature 3) needs to express conditions like:

- `description contains "AWS"` ⇒ category `Software`
- `(description contains "Uber" OR description contains "Lyft") AND amount_cents < 5000` ⇒ category `Travel`, contact `Rideshare`
- `xero_account_id = bank-checking AND date between Apr-Jun` ⇒ project `Q2 ops`

Three modelling options:

(a) **Flat conditions + `group_id` + `group_op`.** Each condition row has a `group_id` (which group does it belong to) and a `group_op` (`and`/`or`). The evaluator reads the rows in order and evaluates groups. Permits `(A AND B) OR C` with two groups. Simple to render in a UI builder, simple to index, simple to migrate.

(b) **Embedded JSON AST.** Each rule has one `expression_jsonb` column holding the full tree: `{op: 'and', children: [...]}`. Most expressive (handles arbitrary nesting), but harder to render predictably in a non-developer UI, harder to index, and the entire tree must be re-parsed on every evaluation.

(c) **CEL / JsonLogic / a textual DSL.** Maximally expressive, terrible for non-developer authors.

The product's audience is bookkeepers, not engineers. A grouped-flat structure matches what they can build in a UI and matches the cognitive model of "this rule has a few conditions, joined by ANDs and ORs". Edge cases requiring more than two levels of nesting are vanishingly rare in practice and can be expressed by adding a second rule.

## Decision

**Flat conditions + `group_id` + `group_op`, evaluated against a snapshot at job start.**

### Schema

```
rules (
  id uuid pk,
  platform_tenant_id uuid not null references platform_tenants,
  xero_tenant_id text,                       -- nullable; null = applies to all the tenant's connections
  name text not null,
  description text,
  enabled boolean not null default true,
  priority integer not null,                 -- lower = earlier
  mode text not null check (mode in ('suggest', 'auto_apply')) default 'suggest',
  current_version_id uuid references rule_versions(id),
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  archived_at timestamptz
)

rule_conditions (
  id uuid pk,
  rule_id uuid not null references rules on delete cascade,
  group_id integer not null,                 -- conditions in same group are AND'd; groups are OR'd
  field text not null check (field in (
    'description','amount_cents','xero_account_id','contact_name','date','reference'
  )),
  operator text not null check (operator in (
    'contains','equals','regex','between','gte','lte','in','starts_with','ends_with'
  )),
  value_json jsonb not null                  -- e.g. {"v":"AWS"} or {"min":100,"max":500}
)

rule_actions (
  id uuid pk,
  rule_id uuid not null references rules on delete cascade,
  action_type text not null check (action_type in (
    'set_category','set_contact','set_project','set_tax_rate'
  )),
  value_json jsonb not null
)

rule_versions (
  id uuid pk,
  rule_id uuid not null references rules on delete cascade,
  version integer not null,
  snapshot_json jsonb not null,              -- {conditions:[...], actions:[...]}
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (rule_id, version)
)

transaction_rule_matches (
  id uuid pk,
  xero_bank_transaction_id uuid not null references xero_bank_transactions on delete cascade,
  rule_id uuid not null references rules,
  rule_version_id uuid not null references rule_versions,
  matched_at timestamptz not null default now(),
  action_applied boolean not null default false,
  override_by_user_id uuid references auth.users,
  override_at timestamptz
)
```

### Evaluation rules

- Rules engine job loads `(rule_id, current_version_id, priority, mode)` ordered by `priority` ascending at job start. Subsequent edits within the same job run do **not** affect that run — the snapshot is frozen.
- For each candidate transaction, evaluate rules in priority order. Within a rule, group conditions by `group_id`; AND inside a group; OR across groups. First rule that matches in `suggest` mode wins; `auto_apply` is deferred to v2.
- Match records the `rule_version_id`, not the `rule_id` alone, so historical matches stay interpretable after edits.

### RLS

```
alter table rules enable row level security;
create policy rules_tenant_isolation on rules
  using (platform_tenant_id = current_setting('app.current_tenant_id')::uuid);
-- (similar for rule_conditions, rule_actions, rule_versions, transaction_rule_matches)
```

## Consequences

**Positive**

- UI builder is straightforward: render groups, with an "OR" between them and "AND" between conditions inside each.
- Conditions are indexable (`rule_id`, `group_id`) for fast loading.
- Versioned snapshots provide a clean audit trail and stable interpretation of historical matches.

**Negative**

- Three-level nesting (`(A and (B or C)) or D`) cannot be expressed; bookkeepers wanting this would split into two rules. Acceptable trade-off given audience.
- Two levels of indirection at evaluation time (rule → conditions → groups). Mitigated by snapshot prefetch.

**Neutral**

- If user demand for deeper nesting emerges, migrating to an embedded JSON AST is feasible by reading `current_version_id.snapshot_json` as the canonical form and treating tables as a derived index.
