create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, name, kind)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount_cents bigint not null,
  currency text not null default 'USD',
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index transactions_business_id_date_idx
  on public.transactions (business_id, date desc);

alter table public.businesses enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "businesses_owner_access"
  on public.businesses
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "categories_owner_access"
  on public.categories
  for all
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = categories.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.businesses b
      where b.id = categories.business_id
        and b.owner_id = auth.uid()
    )
  );

create policy "transactions_owner_access"
  on public.transactions
  for all
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = transactions.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.businesses b
      where b.id = transactions.business_id
        and b.owner_id = auth.uid()
    )
  );
