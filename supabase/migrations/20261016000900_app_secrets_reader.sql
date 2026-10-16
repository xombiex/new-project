-- Edge functions read secrets from Vault (fallback when not set as function env vars).
-- Callable by the service role only; names are restricted to a known allowlist.
-- The secret values themselves are added with vault.create_secret(...) outside migrations
-- so they never end up in migration history or the repo.
create or replace function public.app_secret(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name
    and p_name in ('stripe_secret_key', 'stripe_webhook_secret', 'stripe_connect_webhook_secret',
                   'revenuecat_secret_key', 'revenuecat_webhook_auth');
$$;
revoke execute on function public.app_secret(text) from anon, authenticated, public;
grant execute on function public.app_secret(text) to service_role;
