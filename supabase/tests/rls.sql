-- Local prototype RLS verification script.
-- Run this after applying migrations in a Supabase-compatible Postgres environment.

begin;

create extension if not exists pgcrypto;

-- Two test users; IDs are deterministic for repeatable local runs.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'user-b@example.com')
on conflict (id) do nothing;

insert into public.businesses (id, owner_id, name)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'A LLC'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'B LLC')
on conflict (id) do nothing;

insert into public.categories (id, business_id, name, kind, is_default)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sales', 'income', true),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Software', 'expense', true)
on conflict (id) do nothing;

insert into public.transactions (id, business_id, category_id, type, amount_cents, currency, date, note)
values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'income', 10000, 'USD', current_date, 'A income'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'expense', 5000, 'USD', current_date, 'B expense')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- User A can read only A rows.
select id from public.businesses;
select id from public.categories;
select id from public.transactions;

-- User A cannot mutate B rows: should affect 0 rows.
update public.businesses
set name = 'hacked'
where id = '20000000-0000-0000-0000-000000000002';

update public.categories
set name = 'hacked'
where id = '40000000-0000-0000-0000-000000000002';

update public.transactions
set note = 'hacked'
where id = '60000000-0000-0000-0000-000000000002';

rollback;
