create schema if not exists pgsodium;
create extension if not exists pgsodium with schema pgsodium;

create schema if not exists private;

create table if not exists private.xero_token_key (
  name text primary key,
  key_uuid uuid not null,
  nonce bytea not null,
  created_at timestamptz not null default now()
);

insert into private.xero_token_key (name, key_uuid, nonce)
select
  'xero_token_key',
  id,
  pgsodium.crypto_aead_det_noncegen()
from pgsodium.create_key('aead-det')
on conflict (name) do nothing;

grant execute on function pgsodium.crypto_aead_det_encrypt(bytea, bytea, uuid, bytea) to postgres;
grant execute on function pgsodium.crypto_aead_det_decrypt(bytea, bytea, uuid, bytea) to postgres;

create or replace function public.xero_encrypt_token(plain text)
returns text
language sql
security definer
set search_path = public, private, pgsodium
as $$
  select encode(
    pgsodium.crypto_aead_det_encrypt(
      convert_to(plain, 'utf8'),
      convert_to('xero-token', 'utf8'),
      key_uuid,
      nonce
    ),
    'base64'
  )
  from private.xero_token_key
  where name = 'xero_token_key';
$$;

create or replace function public.xero_decrypt_token(cipher text)
returns text
language sql
security definer
set search_path = public, private, pgsodium
as $$
  select convert_from(
    pgsodium.crypto_aead_det_decrypt(
      decode(cipher, 'base64'),
      convert_to('xero-token', 'utf8'),
      key_uuid,
      nonce
    ),
    'utf8'
  )
  from private.xero_token_key
  where name = 'xero_token_key';
$$;

create or replace function public.xero_lock_connection_refresh(connection_id uuid)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  select pg_advisory_xact_lock(hashtext('xero_refresh:' || connection_id::text));
$$;

revoke all on function public.xero_encrypt_token(text) from public, anon, authenticated;
revoke all on function public.xero_decrypt_token(text) from public, anon, authenticated;
revoke all on function public.xero_lock_connection_refresh(uuid) from public, anon, authenticated;

grant execute on function public.xero_encrypt_token(text) to service_role;
grant execute on function public.xero_decrypt_token(text) to service_role;
grant execute on function public.xero_lock_connection_refresh(uuid) to service_role;
