begin;

-- BKP-011: server-side CSRF state for the Xero OAuth authorization flow.
-- Rows are inserted by `GET /api/xero/connect` and consumed (selected + deleted)
-- by `GET /api/xero/callback`. Expired rows are reaped opportunistically.
create table if not exists public.xero_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_tenant_id uuid not null references public.platform_tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists xero_oauth_states_user_idx
  on public.xero_oauth_states (user_id);

create index if not exists xero_oauth_states_expires_at_idx
  on public.xero_oauth_states (expires_at);

alter table public.xero_oauth_states enable row level security;

drop policy if exists "xero_oauth_states_owner_access" on public.xero_oauth_states;

-- The connect/callback routes run with the authenticated user's session,
-- so RLS lets each user manage only their own pending state rows.
create policy "xero_oauth_states_owner_access"
  on public.xero_oauth_states
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, delete on public.xero_oauth_states to authenticated;

commit;
