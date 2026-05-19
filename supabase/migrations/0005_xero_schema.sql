create table public.xero_connections (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  xero_tenant_name text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz not null,
  scopes text[] not null,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'disconnected')),
  last_synced_at timestamptz,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (platform_tenant_id, xero_tenant_id)
);

comment on column public.xero_connections.encrypted_access_token is
  'Encrypted Xero access token. BKP-012 wires pgsodium/Vault encryption and refresh locking.';

comment on column public.xero_connections.encrypted_refresh_token is
  'Encrypted Xero refresh token. BKP-012 wires pgsodium/Vault encryption and refresh locking.';

create table public.xero_accounts (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  xero_account_id text not null,
  code text,
  name text not null,
  type text,
  class text,
  status text,
  tax_type text,
  enable_payments_to_account boolean,
  show_in_expense_claims boolean,
  raw_json jsonb not null default '{}'::jsonb,
  updated_xero_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (platform_tenant_id, id),
  unique (platform_tenant_id, xero_tenant_id, xero_account_id),
  foreign key (platform_tenant_id, xero_tenant_id)
    references public.xero_connections (platform_tenant_id, xero_tenant_id)
    on delete cascade
);

create table public.xero_contacts (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  xero_contact_id text not null,
  name text not null,
  email text,
  is_supplier boolean not null default false,
  is_customer boolean not null default false,
  raw_json jsonb not null default '{}'::jsonb,
  updated_xero_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (platform_tenant_id, id),
  unique (platform_tenant_id, xero_tenant_id, xero_contact_id),
  foreign key (platform_tenant_id, xero_tenant_id)
    references public.xero_connections (platform_tenant_id, xero_tenant_id)
    on delete cascade
);

create table public.xero_tax_rates (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  xero_tax_type text not null,
  name text not null,
  rate numeric(10, 4),
  status text,
  raw_json jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (platform_tenant_id, xero_tenant_id, xero_tax_type),
  foreign key (platform_tenant_id, xero_tenant_id)
    references public.xero_connections (platform_tenant_id, xero_tenant_id)
    on delete cascade
);

create table public.xero_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  xero_transaction_id text not null,
  bank_account_id uuid,
  type text check (type in ('SPEND', 'RECEIVE', 'SPEND-TRANSFER', 'RECEIVE-TRANSFER')),
  status text,
  is_reconciled boolean not null default false,
  contact_id uuid,
  date date,
  description text,
  reference text,
  currency text,
  total_cents bigint,
  tax_cents bigint,
  subtotal_cents bigint,
  user_overridden_at timestamptz,
  user_override_json jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  updated_xero_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (platform_tenant_id, xero_tenant_id, xero_transaction_id),
  foreign key (platform_tenant_id, xero_tenant_id)
    references public.xero_connections (platform_tenant_id, xero_tenant_id)
    on delete cascade,
  foreign key (platform_tenant_id, bank_account_id)
    references public.xero_accounts (platform_tenant_id, id),
  foreign key (platform_tenant_id, contact_id)
    references public.xero_contacts (platform_tenant_id, id)
);

create table public.xero_invoices (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  type text not null check (type in ('ACCREC', 'ACCPAY')),
  status text not null default 'draft_local' check (status in ('draft_local', 'publishing', 'published', 'publish_failed')),
  xero_invoice_id text,
  xero_invoice_number text,
  contact_id uuid,
  date date,
  due_date date,
  reference text,
  line_items_json jsonb not null default '[]'::jsonb,
  subtotal_cents bigint,
  tax_cents bigint,
  total_cents bigint,
  currency text,
  attachment_path text,
  attachment_status text,
  published_to_xero_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (platform_tenant_id, xero_tenant_id)
    references public.xero_connections (platform_tenant_id, xero_tenant_id)
    on delete cascade,
  foreign key (platform_tenant_id, contact_id)
    references public.xero_contacts (platform_tenant_id, id)
    on delete restrict
);

create table public.xero_webhook_events (
  event_id text primary key,
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  resource_type text,
  resource_id text,
  xero_tenant_id text not null,
  event_type text,
  event_date_utc timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (platform_tenant_id, xero_tenant_id)
    references public.xero_connections (platform_tenant_id, xero_tenant_id)
    on delete cascade
);

create table public.xero_api_calls (
  id uuid primary key default gen_random_uuid(),
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  xero_tenant_id text not null,
  endpoint text not null,
  method text not null,
  status integer,
  duration_ms integer,
  retry_count integer not null default 0,
  error_text text,
  created_at timestamptz not null default now()
);

create index xero_connections_tenant_status_idx
  on public.xero_connections (platform_tenant_id, status);

create index xero_accounts_tenant_type_code_idx
  on public.xero_accounts (platform_tenant_id, xero_tenant_id, type, code);

create index xero_contacts_tenant_name_pattern_idx
  on public.xero_contacts (platform_tenant_id, xero_tenant_id, name text_pattern_ops);

create index xero_bank_transactions_queue_idx
  on public.xero_bank_transactions (platform_tenant_id, xero_tenant_id, is_reconciled, date desc);

create index xero_bank_transactions_date_idx
  on public.xero_bank_transactions (platform_tenant_id, xero_tenant_id, date desc);

create index xero_invoices_tenant_status_idx
  on public.xero_invoices (platform_tenant_id, xero_tenant_id, type, status, created_at desc);

create index xero_webhook_events_tenant_received_idx
  on public.xero_webhook_events (platform_tenant_id, xero_tenant_id, received_at desc);

create index xero_api_calls_tenant_created_idx
  on public.xero_api_calls (platform_tenant_id, xero_tenant_id, created_at desc);

alter table public.xero_connections enable row level security;
alter table public.xero_accounts enable row level security;
alter table public.xero_contacts enable row level security;
alter table public.xero_tax_rates enable row level security;
alter table public.xero_bank_transactions enable row level security;
alter table public.xero_invoices enable row level security;
alter table public.xero_webhook_events enable row level security;
alter table public.xero_api_calls enable row level security;

create policy "xero_connections_tenant_isolation"
  on public.xero_connections
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_accounts_tenant_isolation"
  on public.xero_accounts
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_contacts_tenant_isolation"
  on public.xero_contacts
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_tax_rates_tenant_isolation"
  on public.xero_tax_rates
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_bank_transactions_tenant_isolation"
  on public.xero_bank_transactions
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_invoices_tenant_isolation"
  on public.xero_invoices
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_webhook_events_tenant_isolation"
  on public.xero_webhook_events
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );

create policy "xero_api_calls_tenant_isolation"
  on public.xero_api_calls
  for all
  using (
    public.is_platform_tenant_member(platform_tenant_id)
  )
  with check (
    public.is_platform_tenant_member(platform_tenant_id)
  );
