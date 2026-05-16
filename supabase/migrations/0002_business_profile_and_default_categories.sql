alter table public.businesses
  add column if not exists business_type text;

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (business_id, name, kind, is_default)
  values
    (new.id, 'Sales', 'income', true),
    (new.id, 'Other Income', 'income', true),
    (new.id, 'Software', 'expense', true),
    (new.id, 'Travel', 'expense', true),
    (new.id, 'Meals', 'expense', true),
    (new.id, 'Office', 'expense', true),
    (new.id, 'Marketing', 'expense', true),
    (new.id, 'Contractors', 'expense', true),
    (new.id, 'Equipment', 'expense', true),
    (new.id, 'Bank Fees', 'expense', true),
    (new.id, 'Other', 'expense', true)
  on conflict (business_id, name, kind) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_default_categories_on_business_insert on public.businesses;

create trigger seed_default_categories_on_business_insert
after insert on public.businesses
for each row
execute function public.seed_default_categories();
