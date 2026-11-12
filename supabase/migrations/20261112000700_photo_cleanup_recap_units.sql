-- Drive photos that nothing points at any more are deleted from storage, and the weekly recap
-- uses each person's own units.

-- ─── Photo cleanup ───────────────────────────────────────────────────────
-- Files can't be removed from SQL (only through the Storage API), so the database keeps a list
-- and the notify function empties it. A photo lands on the list when its shared drive is
-- removed (by an admin, by its owner, or with the account) or when it's replaced.
create table private.photo_trash (
  path text primary key,
  queued_at timestamptz not null default now()
);

create or replace function private.queue_old_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.photo_path is not null and (tg_op = 'DELETE' or new.photo_path is distinct from old.photo_path) then
    insert into private.photo_trash (path) values (old.photo_path) on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger activities_queue_old_photo
  after delete or update of photo_path on public.activities
  for each row execute function private.queue_old_photo();

-- What to delete: everything on the list, plus any file in the bucket that no drive uses and is
-- over a day old (an upload whose drive was never saved, or files from before this list existed).
-- A path that a drive uses again is never returned.
create or replace function public.photo_trash_list()
returns setof text language sql stable security definer set search_path = '' as $$
  (
    select t.path from private.photo_trash t
    union
    select o.name from storage.objects o
    where o.bucket_id = 'activity-photos' and o.created_at < now() - interval '1 day'
  )
  except
  select a.photo_path from public.activities a where a.photo_path is not null
  limit 500;
$$;

create or replace function public.photo_trash_done(p_paths text[])
returns void language sql security definer set search_path = '' as $$
  delete from private.photo_trash where path = any(p_paths);
$$;

revoke execute on function public.photo_trash_list() from anon, public, authenticated;
revoke execute on function public.photo_trash_done(text[]) from anon, public, authenticated;
grant execute on function public.photo_trash_list() to service_role;
grant execute on function public.photo_trash_done(text[]) to service_role;

-- Every hour, but only calls the function when there is something to delete.
select cron.schedule(
  'photo-cleanup',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := 'https://qdcdveoidmnwqnabfuvd.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')
    ),
    body := '{"job":"photo_cleanup"}'::jsonb
  )
  where exists (select 1 from public.photo_trash_list());
  $cron$
);

-- ─── Recap units ─────────────────────────────────────────────────────────
-- The app keeps this in step with the units setting, which starts from the phone's region.
alter table public.notification_settings
  add column units text check (units in ('imperial', 'metric'));

drop function public.weekly_recaps();
create function public.weekly_recaps()
returns table (user_id uuid, distance_m double precision, drives integer, place integer, crew integer, units text)
language sql stable security definer set search_path = '' as $$
  with week as (
    select t.user_id, sum(t.distance_m) as d, count(*)::int as n
    from public.trips t where t.role = 'driver' and t.started_at > now() - interval '7 days' group by t.user_id
  ),
  pairs as (
    select f.requester_id as a, f.addressee_id as b from public.friendships f where f.status = 'accepted'
    union all
    select f.addressee_id, f.requester_id from public.friendships f where f.status = 'accepted'
  )
  select w.user_id, w.d, w.n,
    1 + (select count(*) from pairs p join week o on o.user_id = p.b join public.profiles pr on pr.id = p.b and pr.leaderboard where p.a = w.user_id and o.d > w.d)::int,
    1 + (select count(*) from pairs p join public.profiles pr on pr.id = p.b and pr.leaderboard where p.a = w.user_id)::int,
    (select ns.units from public.notification_settings ns where ns.user_id = w.user_id)
  from week w where w.d >= 1000;
$$;
revoke execute on function public.weekly_recaps() from anon, public, authenticated;
grant execute on function public.weekly_recaps() to service_role;
