do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'xero_token_key'
      and column_name = 'key_id'
  ) then
    alter table private.xero_token_key
      add column if not exists key_uuid uuid;

    update private.xero_token_key xtk
    set key_uuid = vk.id
    from pgsodium.valid_key vk
    where xtk.key_uuid is null
      and vk.key_id = xtk.key_id;

    alter table private.xero_token_key
      alter column key_uuid set not null;
  end if;
end $$;
