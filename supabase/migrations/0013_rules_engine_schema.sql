-- BKP-017: Rules engine schema migration
-- Implements ADR-0008 (flat conditions + group_id, evaluator-side AST)
-- Includes BKP-026 columns on transaction_rule_matches upfront

-- ────────────────────────────────────────────────────────────
-- rules
-- ────────────────────────────────────────────────────────────

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text,                        -- null = applies to all tenant's connections
  name text not null,
  description text,
  enabled boolean not null default true,
  priority integer not null,                  -- lower = evaluated earlier
  mode text not null default 'suggest'
    check (mode in ('suggest', 'auto_apply')),
  current_version_id uuid,                    -- FK added below after rule_versions exists
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ────────────────────────────────────────────────────────────
-- rule_conditions
-- ────────────────────────────────────────────────────────────

create table public.rule_conditions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.rules(id) on delete cascade,
  group_id integer not null,                  -- conditions in same group are AND'd; groups are OR'd
  field text not null check (field in (
    'description', 'amount_cents', 'xero_account_id', 'contact_name', 'date', 'reference'
  )),
  operator text not null check (operator in (
    'contains', 'equals', 'regex', 'between', 'gte', 'lte', 'in', 'starts_with', 'ends_with'
  )),
  value_json jsonb not null                   -- e.g. {"v":"AWS"} or {"min":100,"max":500}
);

-- ────────────────────────────────────────────────────────────
-- rule_actions
-- ────────────────────────────────────────────────────────────

create table public.rule_actions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.rules(id) on delete cascade,
  action_type text not null check (action_type in (
    'set_category', 'set_contact', 'set_project', 'set_tax_rate'
  )),
  value_json jsonb not null
);

-- ────────────────────────────────────────────────────────────
-- rule_versions
-- ────────────────────────────────────────────────────────────

create table public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.rules(id) on delete cascade,
  version integer not null,
  snapshot_json jsonb not null,               -- {conditions:[...], actions:[...]}
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (rule_id, version)
);

-- Back-fill the deferred FK from rules → rule_versions
alter table public.rules
  add constraint rules_current_version_id_fkey
  foreign key (current_version_id) references public.rule_versions(id);

-- ────────────────────────────────────────────────────────────
-- transaction_rule_matches
-- Includes BKP-026 AI suggestion columns upfront
-- ────────────────────────────────────────────────────────────

create table public.transaction_rule_matches (
  id uuid primary key default gen_random_uuid(),
  xero_bank_transaction_id uuid not null
    references public.xero_bank_transactions(id) on delete cascade,
  rule_id uuid references public.rules(id),
  rule_version_id uuid references public.rule_versions(id),
  matched_at timestamptz not null default now(),
  action_applied boolean not null default false,
  accepted_at timestamptz,
  override_by_user_id uuid references auth.users(id),
  override_at timestamptz,
  -- BKP-026: AI suggestion fields
  suggestion_source text not null default 'rule'
    check (suggestion_source in ('rule', 'ai')),
  ai_confidence numeric(3,2),                 -- null for rule-sourced; 0.00–1.00
  ai_model text,                              -- null for rule-sourced
  suggested_category_id text,
  suggested_contact_id text,
  suggested_project_id text,
  suggested_tax_rate_id text
);

-- ────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────

-- Fast lookup of active, enabled rules for a tenant in priority order
create index rules_tenant_priority_idx
  on public.rules (platform_tenant_id, priority)
  where archived_at is null and enabled = true;

-- Fast lookup of suggestions for a given transaction
create index transaction_rule_matches_txn_idx
  on public.transaction_rule_matches (xero_bank_transaction_id);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────

alter table public.rules enable row level security;
alter table public.rule_conditions enable row level security;
alter table public.rule_actions enable row level security;
alter table public.rule_versions enable row level security;
alter table public.transaction_rule_matches enable row level security;

-- rules: direct platform_tenant_id column
create policy "rules_tenant_isolation"
  on public.rules
  for all
  using (public.is_platform_tenant_member(platform_tenant_id))
  with check (public.is_platform_tenant_member(platform_tenant_id));

-- rule_conditions: join through rules
create policy "rule_conditions_tenant_isolation"
  on public.rule_conditions
  for all
  using (
    exists (
      select 1 from public.rules r
      where r.id = rule_conditions.rule_id
        and public.is_platform_tenant_member(r.platform_tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.rules r
      where r.id = rule_conditions.rule_id
        and public.is_platform_tenant_member(r.platform_tenant_id)
    )
  );

-- rule_actions: join through rules
create policy "rule_actions_tenant_isolation"
  on public.rule_actions
  for all
  using (
    exists (
      select 1 from public.rules r
      where r.id = rule_actions.rule_id
        and public.is_platform_tenant_member(r.platform_tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.rules r
      where r.id = rule_actions.rule_id
        and public.is_platform_tenant_member(r.platform_tenant_id)
    )
  );

-- rule_versions: join through rules
create policy "rule_versions_tenant_isolation"
  on public.rule_versions
  for all
  using (
    exists (
      select 1 from public.rules r
      where r.id = rule_versions.rule_id
        and public.is_platform_tenant_member(r.platform_tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.rules r
      where r.id = rule_versions.rule_id
        and public.is_platform_tenant_member(r.platform_tenant_id)
    )
  );

-- transaction_rule_matches: join through xero_bank_transactions
create policy "transaction_rule_matches_tenant_isolation"
  on public.transaction_rule_matches
  for all
  using (
    exists (
      select 1 from public.xero_bank_transactions t
      where t.id = transaction_rule_matches.xero_bank_transaction_id
        and public.is_platform_tenant_member(t.platform_tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.xero_bank_transactions t
      where t.id = transaction_rule_matches.xero_bank_transaction_id
        and public.is_platform_tenant_member(t.platform_tenant_id)
    )
  );
