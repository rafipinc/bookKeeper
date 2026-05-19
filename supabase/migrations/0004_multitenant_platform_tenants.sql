begin;

create extension if not exists pgcrypto;

create table if not exists public.platform_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_tenant_members (
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'bookkeeper', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (platform_tenant_id, user_id)
);

alter table public.businesses
  add column if not exists platform_tenant_id uuid references public.platform_tenants(id) on delete restrict;

alter table public.categories
  add column if not exists platform_tenant_id uuid references public.platform_tenants(id) on delete restrict;

alter table public.transactions
  add column if not exists platform_tenant_id uuid references public.platform_tenants(id) on delete restrict;

create or replace function public.platform_tenant_slug_from_email(p_email text, p_user_id uuid, p_position bigint)
returns text
language sql
immutable
as $$
  select left(
    concat(
      coalesce(
        nullif(
          regexp_replace(
            lower(coalesce(nullif(split_part(p_email, '@', 1), ''), left(p_user_id::text, 8))),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          ''
        ),
        left(p_user_id::text, 8)
      ),
      case when p_position > 1 then '-' || p_position::text else '' end
    ),
    63
  );
$$;

with numbered_users as (
  select
    u.id as user_id,
    u.email,
    row_number() over (
      partition by lower(coalesce(nullif(split_part(u.email, '@', 1), ''), left(u.id::text, 8)))
      order by u.created_at, u.id
    ) as slug_position
  from auth.users u
),
users_without_tenants as (
  select
    nu.user_id,
    coalesce(nullif(split_part(nu.email, '@', 1), ''), 'User ' || left(nu.user_id::text, 8)) as tenant_name,
    public.platform_tenant_slug_from_email(nu.email, nu.user_id, nu.slug_position) as tenant_slug
  from numbered_users nu
  where not exists (
    select 1
    from public.platform_tenant_members ptm
    where ptm.user_id = nu.user_id
  )
),
inserted_tenants as (
  insert into public.platform_tenants (name, slug)
  select tenant_name, tenant_slug
  from users_without_tenants
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.platform_tenant_members (platform_tenant_id, user_id, role)
select pt.id, uwt.user_id, 'admin'
from users_without_tenants uwt
join public.platform_tenants pt on pt.slug = uwt.tenant_slug
on conflict (platform_tenant_id, user_id) do nothing;

with owner_tenants as (
  select distinct on (ptm.user_id)
    ptm.user_id,
    ptm.platform_tenant_id
  from public.platform_tenant_members ptm
  order by ptm.user_id, ptm.created_at, ptm.platform_tenant_id
)
update public.businesses b
set platform_tenant_id = ot.platform_tenant_id
from owner_tenants ot
where b.platform_tenant_id is null
  and b.owner_id = ot.user_id;

update public.categories c
set platform_tenant_id = b.platform_tenant_id
from public.businesses b
where c.platform_tenant_id is null
  and c.business_id = b.id;

update public.transactions t
set platform_tenant_id = b.platform_tenant_id
from public.businesses b
where t.platform_tenant_id is null
  and t.business_id = b.id;

alter table public.businesses
  alter column platform_tenant_id set not null;

alter table public.categories
  alter column platform_tenant_id set not null;

alter table public.transactions
  alter column platform_tenant_id set not null;

create index if not exists platform_tenant_members_user_id_idx
  on public.platform_tenant_members (user_id);

create index if not exists businesses_platform_tenant_id_idx
  on public.businesses (platform_tenant_id);

create index if not exists categories_platform_tenant_id_idx
  on public.categories (platform_tenant_id);

create index if not exists transactions_platform_tenant_id_date_idx
  on public.transactions (platform_tenant_id, date desc);

create or replace function public.current_platform_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

create or replace function public.is_platform_tenant_member(p_platform_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_tenant_members ptm
    where ptm.platform_tenant_id = p_platform_tenant_id
      and ptm.user_id = auth.uid()
  );
$$;

create or replace function public.set_current_tenant(p_platform_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_tenant_member(p_platform_tenant_id) then
    raise exception 'User is not a member of platform tenant %', p_platform_tenant_id
      using errcode = '42501';
  end if;

  perform set_config('app.current_tenant_id', p_platform_tenant_id::text, true);
  return p_platform_tenant_id;
end;
$$;

create or replace function public.ensure_user_platform_tenant(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_tenant_id uuid;
  v_email text;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 1;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Cannot create a platform tenant for another user'
      using errcode = '42501';
  end if;

  select ptm.platform_tenant_id
    into v_existing_tenant_id
  from public.platform_tenant_members ptm
  where ptm.user_id = p_user_id
  order by ptm.created_at, ptm.platform_tenant_id
  limit 1;

  if v_existing_tenant_id is not null then
    return v_existing_tenant_id;
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = p_user_id;

  v_base_slug := public.platform_tenant_slug_from_email(v_email, p_user_id, 1);
  v_slug := v_base_slug;

  while exists (select 1 from public.platform_tenants pt where pt.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(v_base_slug || '-' || v_suffix::text, 63);
  end loop;

  insert into public.platform_tenants (name, slug)
  values (coalesce(nullif(split_part(v_email, '@', 1), ''), 'User ' || left(p_user_id::text, 8)), v_slug)
  returning id into v_existing_tenant_id;

  insert into public.platform_tenant_members (platform_tenant_id, user_id, role)
  values (v_existing_tenant_id, p_user_id, 'admin');

  return v_existing_tenant_id;
end;
$$;

create or replace function public.assign_business_platform_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.platform_tenant_id is null then
    new.platform_tenant_id := public.ensure_user_platform_tenant(new.owner_id);
  end if;

  return new;
end;
$$;

drop trigger if exists assign_business_platform_tenant_on_insert on public.businesses;

create trigger assign_business_platform_tenant_on_insert
before insert on public.businesses
for each row
execute function public.assign_business_platform_tenant();

create or replace function public.assign_category_platform_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.platform_tenant_id is null then
    select b.platform_tenant_id
      into new.platform_tenant_id
    from public.businesses b
    where b.id = new.business_id;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_category_platform_tenant_on_insert on public.categories;

create trigger assign_category_platform_tenant_on_insert
before insert on public.categories
for each row
execute function public.assign_category_platform_tenant();

create or replace function public.assign_transaction_platform_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.platform_tenant_id is null then
    select b.platform_tenant_id
      into new.platform_tenant_id
    from public.businesses b
    where b.id = new.business_id;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_transaction_platform_tenant_on_insert on public.transactions;

create trigger assign_transaction_platform_tenant_on_insert
before insert on public.transactions
for each row
execute function public.assign_transaction_platform_tenant();

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (platform_tenant_id, business_id, name, kind, is_default)
  values
    (new.platform_tenant_id, new.id, 'Sales', 'income', true),
    (new.platform_tenant_id, new.id, 'Other Income', 'income', true),
    (new.platform_tenant_id, new.id, 'Software', 'expense', true),
    (new.platform_tenant_id, new.id, 'Travel', 'expense', true),
    (new.platform_tenant_id, new.id, 'Meals', 'expense', true),
    (new.platform_tenant_id, new.id, 'Office', 'expense', true),
    (new.platform_tenant_id, new.id, 'Marketing', 'expense', true),
    (new.platform_tenant_id, new.id, 'Contractors', 'expense', true),
    (new.platform_tenant_id, new.id, 'Equipment', 'expense', true),
    (new.platform_tenant_id, new.id, 'Bank Fees', 'expense', true),
    (new.platform_tenant_id, new.id, 'Other', 'expense', true)
  on conflict (business_id, name, kind) do nothing;

  return new;
end;
$$;

alter table public.platform_tenants enable row level security;
alter table public.platform_tenant_members enable row level security;

drop policy if exists "platform_tenants_member_select" on public.platform_tenants;
drop policy if exists "platform_tenant_members_self_select" on public.platform_tenant_members;

create policy "platform_tenants_member_select"
  on public.platform_tenants
  for select
  using (public.is_platform_tenant_member(id));

create policy "platform_tenant_members_self_select"
  on public.platform_tenant_members
  for select
  using (user_id = auth.uid());

drop policy if exists "businesses_owner_access" on public.businesses;
drop policy if exists "categories_owner_access" on public.categories;
drop policy if exists "transactions_owner_access" on public.transactions;
drop policy if exists "businesses_tenant_access" on public.businesses;
drop policy if exists "categories_tenant_access" on public.categories;
drop policy if exists "transactions_tenant_access" on public.transactions;

create policy "businesses_tenant_access"
  on public.businesses
  for all
  using (public.is_platform_tenant_member(platform_tenant_id))
  with check (public.is_platform_tenant_member(platform_tenant_id));

create policy "categories_tenant_access"
  on public.categories
  for all
  using (public.is_platform_tenant_member(platform_tenant_id))
  with check (public.is_platform_tenant_member(platform_tenant_id));

create policy "transactions_tenant_access"
  on public.transactions
  for all
  using (public.is_platform_tenant_member(platform_tenant_id))
  with check (public.is_platform_tenant_member(platform_tenant_id));

grant execute on function public.set_current_tenant(uuid) to authenticated;
grant execute on function public.ensure_user_platform_tenant(uuid) to authenticated;

commit;
