-- Grant execute on Xero token encryption/decryption RPCs to API-accessible roles.
-- The functions are SECURITY DEFINER so they run as postgres (owner), but
-- PostgREST still requires an explicit EXECUTE grant on the calling role.
-- service_role: used by the server-side token encryption in the OAuth callback
--               and by the token refresh path in tokens.ts.
-- authenticated: future-proofing in case a client-side call is ever needed.
grant execute on function public.xero_encrypt_token(text) to service_role, authenticated;
grant execute on function public.xero_decrypt_token(text) to service_role, authenticated;
grant execute on function public.xero_lock_connection_refresh(uuid) to service_role, authenticated;
