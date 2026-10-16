-- Self-service account deletion (App Store guideline 5.1.1(v)) and cleanup of expired road reports,
-- both promised in the Privacy Policy.

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = v_uid; -- cascades to profiles, trips, friendships, drives, clubs, tokens
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Expired road reports are hidden immediately; delete them a day later.
select cron.schedule(
  'purge-expired-road-reports',
  '17 3 * * *',
  $$ delete from public.road_reports where expires_at < now() - interval '1 day' $$
);
