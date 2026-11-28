-- Xero token functions are server-only.
--
-- 0011 granted these to `authenticated` as future-proofing. Combined with the
-- xero_connections RLS policy (members can select encrypted_refresh_token),
-- that let any signed-in tenant member decrypt the organisation's Xero
-- tokens through /rest/v1/rpc/xero_decrypt_token.
--
-- Every call site (lib/xero/tokens.ts) uses the service-role client, so
-- service_role keeps its grant and nothing in the app changes.

revoke execute on function public.xero_encrypt_token(text) from authenticated;
revoke execute on function public.xero_decrypt_token(text) from authenticated;
revoke execute on function public.xero_lock_connection_refresh(uuid) from authenticated;
