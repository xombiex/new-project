-- Service and fuel log for garage cars, a photo on a shared drive (Pro), saved drives, and the
-- weekly recap push.

-- ─── Service and fuel log ────────────────────────────────────────────────
create table public.car_maintenance (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('oil', 'tires', 'brakes', 'battery', 'fluids', 'filters', 'inspection', 'repair', 'upgrade', 'other')),
  done_on date not null default current_date,
  odometer_km numeric check (odometer_km >= 0),
  cost_cents integer check (cost_cents >= 0),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index car_maintenance_car_idx on public.car_maintenance(car_id, done_on desc, id desc);
create index car_maintenance_user_idx on public.car_maintenance(user_id);
alter table public.car_maintenance enable row level security;

create table public.car_fuel (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  filled_on date not null default current_date,
  litres numeric not null check (litres > 0 and litres < 1000),
  cost_cents integer check (cost_cents >= 0),
  odometer_km numeric check (odometer_km >= 0),
  full_tank boolean not null default true,
  created_at timestamptz not null default now()
);
create index car_fuel_car_idx on public.car_fuel(car_id, filled_on desc, id desc);
create index car_fuel_user_idx on public.car_fuel(user_id);
alter table public.car_fuel enable row level security;

-- Only the owner, and only for a car that is theirs.
create policy "owner reads maintenance" on public.car_maintenance for select to authenticated using (user_id = (select auth.uid()));
create policy "owner adds maintenance" on public.car_maintenance for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid())));
create policy "owner removes maintenance" on public.car_maintenance for delete to authenticated using (user_id = (select auth.uid()));
create policy "owner reads fuel" on public.car_fuel for select to authenticated using (user_id = (select auth.uid()));
create policy "owner adds fuel" on public.car_fuel for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid())));
create policy "owner removes fuel" on public.car_fuel for delete to authenticated using (user_id = (select auth.uid()));

-- ─── A photo on a shared drive (Pro) ─────────────────────────────────────
alter table public.activities add column photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('activity-photos', 'activity-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

-- Files live at <user id>/<anything>. Uploading needs Pro; reading needs to be able to see the
-- drive the photo is on (the activities check runs under the reader's own access).
create policy "pro uploads drive photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and private.has_entitlement((select auth.uid()), 'pro'));
create policy "owner replaces drive photos" on storage.objects for update to authenticated
  using (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes drive photos" on storage.objects for delete to authenticated
  using (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "read photos of visible drives" on storage.objects for select to authenticated
  using (bucket_id = 'activity-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or exists (select 1 from public.activities a where a.photo_path = name)));

create or replace function public.set_activity_photo(p_activity uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_path is not null then
    if not private.has_entitlement(v_uid, 'pro') then raise exception 'photos need Convoy Pro'; end if;
    if p_path not like v_uid::text || '/%' then raise exception 'not allowed'; end if;
  end if;
  update public.activities set photo_path = p_path where id = p_activity and user_id = v_uid;
  if not found then raise exception 'drive not found'; end if;
end;
$$;

-- ─── Saved drives ────────────────────────────────────────────────────────
-- A bookmark on someone's shared drive. It points at the drive rather than copying the route,
-- so when the owner stops sharing, the saved copy goes too.
create table public.saved_routes (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);
create index saved_routes_activity_idx on public.saved_routes(activity_id);
alter table public.saved_routes enable row level security;
create policy "read own saved" on public.saved_routes for select to authenticated using (user_id = (select auth.uid()));
create policy "save a visible drive" on public.saved_routes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.activities a where a.id = activity_id));
create policy "unsave" on public.saved_routes for delete to authenticated using (user_id = (select auth.uid()));

-- The feed reader again, now with the photo, whether I saved it, and a 'saved' scope.
drop function public.activity_feed(text, uuid, uuid, uuid, timestamptz, uuid, integer);
create function public.activity_feed(
  p_scope text default 'home',
  p_club uuid default null,
  p_user uuid default null,
  p_activity uuid default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid, user_id uuid, username text, display_name text, avatar_color text,
  trip_id uuid, to_friends boolean, club_id uuid, club_name text, title text, started_at timestamptz,
  distance_m double precision, moving_s integer, car_label text, car_body text, car_paint text,
  preview jsonb, like_count integer, comment_count integer, liked_by_me boolean, created_at timestamptz,
  photo_path text, saved_by_me boolean
)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid),
  friends as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as fid
    from public.friendships f, me
    where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  ),
  my_clubs as (select m.club_id as cid from public.club_members m, me where m.user_id = me.uid),
  saved as (select s.activity_id as aid from public.saved_routes s, me where s.user_id = me.uid)
  select
    a.id, a.user_id, p.username, p.display_name, p.avatar_color,
    case when a.user_id = me.uid then a.trip_id end,
    a.to_friends,
    case when a.club_id in (select cid from my_clubs) then a.club_id end,
    case when a.club_id in (select cid from my_clubs) then c.name end,
    a.title, a.started_at, a.distance_m, a.moving_s, a.car_label, a.car_body, a.car_paint,
    a.preview, a.like_count, a.comment_count,
    exists (select 1 from public.activity_likes l where l.activity_id = a.id and l.user_id = me.uid),
    a.created_at, a.photo_path,
    a.id in (select aid from saved)
  from public.activities a
  cross join me
  join public.profiles p on p.id = a.user_id
  left join public.clubs c on c.id = a.club_id
  where me.uid is not null
    and (
      a.user_id = me.uid
      or (a.to_friends and a.user_id in (select fid from friends))
      or a.club_id in (select cid from my_clubs)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.uid and b.blocked_id = a.user_id) or (b.blocker_id = a.user_id and b.blocked_id = me.uid)
    )
    and case p_scope
      when 'home' then true
      when 'club' then a.club_id = p_club and p_club in (select cid from my_clubs)
      when 'user' then a.user_id = p_user
      when 'one' then a.id = p_activity
      when 'saved' then a.id in (select aid from saved)
      else false
    end
    and (p_before is null or (a.created_at, a.id) < (p_before, p_before_id))
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ─── Weekly recap ────────────────────────────────────────────────────────
alter table public.notification_settings add column weekly_recap boolean not null default true;

-- Everyone who drove at least a kilometre in the last 7 days: how far, how many drives, and
-- where that puts them among the friends who take part in the leaderboard.
create or replace function public.weekly_recaps()
returns table (user_id uuid, distance_m double precision, drives integer, place integer, crew integer)
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
    1 + (select count(*) from pairs p join public.profiles pr on pr.id = p.b and pr.leaderboard where p.a = w.user_id)::int
  from week w where w.d >= 1000;
$$;

revoke execute on function public.set_activity_photo(uuid, text) from anon, public;
revoke execute on function public.activity_feed(text, uuid, uuid, uuid, timestamptz, uuid, integer) from anon, public;
revoke execute on function public.weekly_recaps() from anon, public, authenticated;
grant execute on function public.set_activity_photo(uuid, text) to authenticated;
grant execute on function public.activity_feed(text, uuid, uuid, uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.weekly_recaps() to service_role;

-- Sunday 17:00 UTC (midday in the Americas, evening in Europe).
select cron.schedule(
  'weekly-recap',
  '0 17 * * 0',
  $cron$
  select net.http_post(
    url := 'https://qdcdveoidmnwqnabfuvd.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')
    ),
    body := '{"job":"weekly_recap"}'::jsonb
  );
  $cron$
);
