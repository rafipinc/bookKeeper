alter table public.businesses
  add constraint businesses_owner_id_unique unique (owner_id);
