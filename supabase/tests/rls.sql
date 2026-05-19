-- Local prototype RLS verification script.
-- Run after applying migrations in a Supabase-compatible Postgres environment.

begin;

create extension if not exists pgcrypto;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'user-b@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'user-c@example.com')
on conflict (id) do nothing;

insert into public.platform_tenants (id, name, slug)
values
  ('70000000-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a-rls'),
  ('80000000-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b-rls')
on conflict (id) do nothing;

insert into public.platform_tenant_members (platform_tenant_id, user_id, role)
values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'admin')
on conflict (platform_tenant_id, user_id) do nothing;

insert into public.businesses (id, platform_tenant_id, owner_id, name)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1',
    'A LLC'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-0000000000b2',
    'B LLC'
  )
on conflict (id) do nothing;

insert into public.categories (id, platform_tenant_id, business_id, name, kind, is_default)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Consulting Income',
    'income',
    false
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Hosting',
    'expense',
    false
  )
on conflict (id) do nothing;

insert into public.transactions (id, platform_tenant_id, business_id, category_id, type, amount_cents, currency, date, note)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'income',
    10000,
    'USD',
    current_date,
    'A income'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    'expense',
    5000,
    'USD',
    current_date,
    'B expense'
  )
on conflict (id) do nothing;

insert into public.xero_connections (
  id,
  platform_tenant_id,
  xero_tenant_id,
  xero_tenant_name,
  encrypted_access_token,
  encrypted_refresh_token,
  access_token_expires_at,
  scopes
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'xero-tenant-a',
    'Xero Tenant A',
    'encrypted-access-a',
    'encrypted-refresh-a',
    now() + interval '30 minutes',
    array['accounting.transactions', 'offline_access']
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000002',
    'xero-tenant-b',
    'Xero Tenant B',
    'encrypted-access-b',
    'encrypted-refresh-b',
    now() + interval '30 minutes',
    array['accounting.transactions', 'offline_access']
  )
on conflict (platform_tenant_id, xero_tenant_id) do nothing;

insert into public.xero_accounts (id, platform_tenant_id, xero_tenant_id, xero_account_id, code, name, type)
values
  ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'xero-tenant-a', 'account-a', '090', 'Business Bank A', 'BANK'),
  ('82000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'xero-tenant-b', 'account-b', '091', 'Business Bank B', 'BANK')
on conflict (platform_tenant_id, xero_tenant_id, xero_account_id) do nothing;

insert into public.xero_contacts (id, platform_tenant_id, xero_tenant_id, xero_contact_id, name, email, is_customer)
values
  ('73000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'xero-tenant-a', 'contact-a', 'Customer A', 'a@example.com', true),
  ('83000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'xero-tenant-b', 'contact-b', 'Customer B', 'b@example.com', true)
on conflict (platform_tenant_id, xero_tenant_id, xero_contact_id) do nothing;

insert into public.xero_tax_rates (platform_tenant_id, xero_tenant_id, xero_tax_type, name, rate)
values
  ('70000000-0000-0000-0000-000000000001', 'xero-tenant-a', 'OUTPUT', 'GST on Income', 10.0000),
  ('80000000-0000-0000-0000-000000000002', 'xero-tenant-b', 'INPUT', 'GST on Expenses', 10.0000)
on conflict (platform_tenant_id, xero_tenant_id, xero_tax_type) do nothing;

insert into public.xero_bank_transactions (
  id,
  platform_tenant_id,
  xero_tenant_id,
  xero_transaction_id,
  bank_account_id,
  contact_id,
  type,
  status,
  date,
  total_cents
)
values
  ('74000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'xero-tenant-a', 'bank-transaction-a', '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'RECEIVE', 'AUTHORISED', current_date, 10000),
  ('84000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'xero-tenant-b', 'bank-transaction-b', '82000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000002', 'SPEND', 'AUTHORISED', current_date, 5000)
on conflict (platform_tenant_id, xero_tenant_id, xero_transaction_id) do nothing;

insert into public.xero_invoices (
  id,
  platform_tenant_id,
  xero_tenant_id,
  type,
  status,
  contact_id,
  date,
  due_date,
  line_items_json,
  total_cents,
  created_by
)
values
  ('75000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'xero-tenant-a', 'ACCREC', 'draft_local', '73000000-0000-0000-0000-000000000001', current_date, current_date + 14, '[]'::jsonb, 10000, '00000000-0000-0000-0000-0000000000a1'),
  ('85000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'xero-tenant-b', 'ACCPAY', 'draft_local', '83000000-0000-0000-0000-000000000002', current_date, current_date + 14, '[]'::jsonb, 5000, '00000000-0000-0000-0000-0000000000b2')
on conflict (id) do nothing;

insert into public.xero_webhook_events (event_id, platform_tenant_id, xero_tenant_id, resource_type, resource_id, event_type)
values
  ('webhook-event-a', '70000000-0000-0000-0000-000000000001', 'xero-tenant-a', 'INVOICE', 'invoice-a', 'UPDATE'),
  ('webhook-event-b', '80000000-0000-0000-0000-000000000002', 'xero-tenant-b', 'INVOICE', 'invoice-b', 'UPDATE')
on conflict (event_id) do nothing;

insert into public.xero_api_calls (id, platform_tenant_id, xero_tenant_id, endpoint, method, status, duration_ms, retry_count)
values
  ('76000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'xero-tenant-a', '/BankTransactions', 'GET', 200, 120, 0),
  ('86000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'xero-tenant-b', '/BankTransactions', 'GET', 200, 130, 0)
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- Supabase-js sends each query as a separate HTTP request, so tenant isolation
-- must work from membership alone rather than relying on app.current_tenant_id.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.businesses;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 business by membership, got %', v_count;
  end if;

  select count(*) into v_count
  from public.businesses
  where id = '20000000-0000-0000-0000-000000000002';
  if v_count <> 0 then
    raise exception 'User A could see tenant B business';
  end if;

  select count(*) into v_count from public.categories;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 category by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.transactions;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 transaction by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_connections;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_connections row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_accounts;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_accounts row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_contacts;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_contacts row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_tax_rates;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_tax_rates row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_bank_transactions;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_bank_transactions row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_invoices;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_invoices row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_webhook_events;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_webhook_events row by membership, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_api_calls;
  if v_count <> 1 then
    raise exception 'Expected user A to see 1 xero_api_calls row by membership, got %', v_count;
  end if;
end;
$$;

update public.xero_connections
set status = 'disconnected'
where id = '81000000-0000-0000-0000-000000000002';

do $$
begin
  if exists (
    select 1
    from public.xero_connections
    where id = '81000000-0000-0000-0000-000000000002'
      and status = 'disconnected'
  ) then
    raise exception 'User A updated a tenant B xero_connections row';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.set_current_tenant('80000000-0000-0000-0000-000000000002');
    raise exception 'User A set non-member tenant B as current tenant';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.businesses;
  if v_count <> 0 then
    raise exception 'User C with no membership saw businesses, got %', v_count;
  end if;

  select count(*) into v_count from public.xero_connections;
  if v_count <> 0 then
    raise exception 'User C with no membership saw Xero rows, got %', v_count;
  end if;
end;
$$;

rollback;
