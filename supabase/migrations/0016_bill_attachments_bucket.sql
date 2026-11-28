-- Private Storage bucket for bill attachments (BKP-024).
--
-- The bucket was referenced by app/api/bills/attachments/upload-url and the
-- xero-bill-publish job but never created by a migration.
--
-- Objects live at tenant/<platform_tenant_id>/bills/<bill_id>/<filename>.
-- The upload-url route signs uploads with the signed-in user's client, so
-- members need select/insert/update (upsert) on their own tenant's folder.
-- The publish job reads with the service role, which bypasses these policies.

insert into storage.buckets (id, name, public)
values ('xero-bill-documents', 'xero-bill-documents', false)
on conflict (id) do nothing;

create policy "bill_attachments_tenant_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'xero-bill-documents'
    and (storage.foldername(name))[1] = 'tenant'
    and exists (
      select 1
      from public.platform_tenant_members ptm
      where ptm.user_id = auth.uid()
        and ptm.platform_tenant_id::text = (storage.foldername(name))[2]
    )
  );

create policy "bill_attachments_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'xero-bill-documents'
    and (storage.foldername(name))[1] = 'tenant'
    and exists (
      select 1
      from public.platform_tenant_members ptm
      where ptm.user_id = auth.uid()
        and ptm.platform_tenant_id::text = (storage.foldername(name))[2]
    )
  );

create policy "bill_attachments_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'xero-bill-documents'
    and (storage.foldername(name))[1] = 'tenant'
    and exists (
      select 1
      from public.platform_tenant_members ptm
      where ptm.user_id = auth.uid()
        and ptm.platform_tenant_id::text = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'xero-bill-documents'
    and (storage.foldername(name))[1] = 'tenant'
    and exists (
      select 1
      from public.platform_tenant_members ptm
      where ptm.user_id = auth.uid()
        and ptm.platform_tenant_id::text = (storage.foldername(name))[2]
    )
  );
