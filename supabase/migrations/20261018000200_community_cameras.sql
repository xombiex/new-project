-- Community camera reports ("Camera Scouts").
--
-- Anyone signed in can report a speed camera, red light camera or plate reader where they are. It
-- shows as a "?" until other drivers confirm it; then it's a real camera for everyone (map +
-- alerts). Votes are weighted by the voter's scout rank, so experienced scouts count for more.
-- Cameras that get taken down retire themselves after enough "it's gone" votes, and the same works
-- for cameras that come from OpenStreetMap. Reporters get an inbox message when theirs is verified.

create table public.community_cameras (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('speed', 'redlight', 'alpr')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- compass direction the reporter was driving: which way the camera watches
  direction real check (direction is null or (direction >= 0 and direction < 360)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'retired')),
  -- the reporter's vote weight, and weighted totals (reporter included)
  reporter_weight real not null default 1,
  present real not null default 0,
  gone real not null default 0,
  verified_at timestamptz
);
create index community_cameras_area_idx on public.community_cameras(lat, lng) where status in ('pending', 'verified');
create index community_cameras_creator_idx on public.community_cameras(created_by, created_at);
-- No policies: everything goes through the functions below, which never reveal who reported what.
alter table public.community_cameras enable row level security;

create table public.camera_votes (
  camera_id uuid not null references public.community_cameras(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  present boolean not null,
  weight real not null,
  created_at timestamptz not null default now(),
  primary key (camera_id, user_id)
);
create index camera_votes_user_idx on public.camera_votes(user_id);
alter table public.camera_votes enable row level security;

-- "This OpenStreetMap camera is gone" (or "still here") votes.
create table public.osm_camera_votes (
  osm_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  present boolean not null,
  weight real not null,
  created_at timestamptz not null default now(),
  primary key (osm_id, user_id)
);
create index osm_camera_votes_user_idx on public.osm_camera_votes(user_id);
alter table public.osm_camera_votes enable row level security;

-- ─── Scout points and rank ───────────────────────────────────────────────
-- 10 points per camera you found that got verified, 2 per verified camera you helped confirm,
-- 1 per vote that matched how a report ended up (verified / rejected / retired).
create or replace function private.scout_points(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select
    10 * (select count(*) from public.community_cameras c where c.created_by = p_user and c.status in ('verified', 'retired') and c.verified_at is not null)::int
    + 2 * (select count(*) from public.camera_votes v join public.community_cameras c on c.id = v.camera_id
           where v.user_id = p_user and v.present and c.verified_at is not null and v.created_at <= c.verified_at)::int
    + (select count(*) from public.camera_votes v join public.community_cameras c on c.id = v.camera_id
       where v.user_id = p_user and ((not v.present and c.status in ('rejected', 'retired')) or (v.present and c.status = 'verified')))::int;
$$;

-- Rookie 1×, Spotter (10+) 1×, Scout (50+) 1.5×, Ranger (150+) 2×, Legend (400+) 2.5×.
create or replace function private.scout_weight(p_user uuid)
returns real language sql stable security definer set search_path = '' as $$
  select case
    when p >= 400 then 2.5
    when p >= 150 then 2
    when p >= 50 then 1.5
    else 1
  end::real
  from (select private.scout_points(p_user) as p) s;
$$;

create or replace function public.my_scout_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_points int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_points := private.scout_points(v_uid);
  return jsonb_build_object(
    'points', v_points,
    'weight', private.scout_weight(v_uid),
    'verified', (select count(*) from public.community_cameras where created_by = v_uid and verified_at is not null),
    'pending', (select count(*) from public.community_cameras where created_by = v_uid and status = 'pending'),
    'votes', (select count(*) from public.camera_votes where user_id = v_uid) + (select count(*) from public.osm_camera_votes where user_id = v_uid)
  );
end;
$$;

-- ─── Thresholds ─────────────────────────────────────────────────────────
-- Pending → verified at 3 weighted "present" (reporter included) and 2 ahead of "gone".
-- Pending → rejected when "gone" leads by 2. Verified → retired when the last 30 days' "gone"
-- votes reach 3 and outweigh that window's "present" votes (old confirmations don't keep a
-- removed camera alive forever).
create or replace function private.settle_camera(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.community_cameras;
  v_label text;
  recent_gone real;
  recent_present real;
begin
  select * into c from public.community_cameras where id = p_id for update;
  if c.status = 'pending' and c.present >= 3 and c.present >= c.gone + 2 then
    update public.community_cameras set status = 'verified', verified_at = now() where id = p_id;
    -- Tell the scout who found it (in-app inbox; no push needed).
    if c.created_by is not null and exists (select 1 from public.profiles where id = c.created_by) then
      v_label := case c.kind when 'speed' then 'speed camera' when 'redlight' then 'red light camera' else 'plate reader' end;
      insert into public.messages (user_id, title, body)
      values (c.created_by, 'Your camera report was verified',
              format('Other drivers confirmed the %s you reported. It''s on the map for everyone now. +10 scout points.', v_label));
    end if;
  elsif c.status = 'pending' and c.gone >= c.present + 2 then
    update public.community_cameras set status = 'rejected' where id = p_id;
  elsif c.status = 'verified' then
    select coalesce(sum(case when not v.present then v.weight end), 0), coalesce(sum(case when v.present then v.weight end), 0)
      into recent_gone, recent_present
      from public.camera_votes v where v.camera_id = p_id and v.created_at > now() - interval '30 days';
    if recent_gone >= 3 and recent_gone > recent_present then
      update public.community_cameras set status = 'retired' where id = p_id;
    end if;
  end if;
end;
$$;

-- ─── Reporting and voting ───────────────────────────────────────────────
create or replace function public.vote_camera(p_id uuid, p_present boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_weight real;
  c public.community_cameras;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into c from public.community_cameras where id = p_id;
  if c.id is null or c.status not in ('pending', 'verified') then return coalesce(c.status, 'missing'); end if;

  -- The reporter taking it back just withdraws a pending report.
  if c.created_by = v_uid then
    if not p_present and c.status = 'pending' then update public.community_cameras set status = 'rejected' where id = p_id; end if;
    return (select status from public.community_cameras where id = p_id);
  end if;

  -- One vote per person, but you can change it (or renew it: a fresh "still here" counts again).
  v_weight := private.scout_weight(v_uid);
  insert into public.camera_votes (camera_id, user_id, present, weight) values (p_id, v_uid, p_present, v_weight)
  on conflict (camera_id, user_id) do update set present = excluded.present, weight = excluded.weight, created_at = now();
  update public.community_cameras cc
    set present = cc.reporter_weight + coalesce((select sum(v.weight) from public.camera_votes v where v.camera_id = p_id and v.present), 0),
        gone = coalesce((select sum(v.weight) from public.camera_votes v where v.camera_id = p_id and not v.present), 0)
    where cc.id = p_id;
  perform private.settle_camera(p_id);
  return (select status from public.community_cameras where id = p_id);
end;
$$;

create or replace function public.report_camera(p_kind text, p_lat double precision, p_lng double precision, p_direction real default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_weight real;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('speed', 'redlight', 'alpr') then raise exception 'unknown camera type'; end if;
  if (select count(*) from public.community_cameras where created_by = v_uid and created_at > now() - interval '1 day') >= 15 then
    raise exception 'report limit reached';
  end if;

  -- Already reported (or already known) right here: count it as a confirmation.
  select c.id into v_id from public.community_cameras c
  where c.status in ('pending', 'verified') and c.kind = p_kind
    and c.lat between p_lat - 0.001 and p_lat + 0.001
    and private.dist_m(c.lat, c.lng, p_lat, p_lng) < 60
  order by c.created_at limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'status', public.vote_camera(v_id, true), 'existing', true);
  end if;
  if exists (select 1 from public.road_cameras r where r.kind = p_kind
             and r.lat between p_lat - 0.001 and p_lat + 0.001 and private.dist_m(r.lat, r.lng, p_lat, p_lng) < 60) then
    return jsonb_build_object('id', null, 'status', 'known', 'existing', true);
  end if;

  v_weight := private.scout_weight(v_uid);
  insert into public.community_cameras (kind, lat, lng, direction, created_by, reporter_weight, present)
  values (p_kind, p_lat, p_lng, case when p_direction is null then null else mod(p_direction::numeric + 360, 360)::real end, v_uid, v_weight, v_weight)
  returning id into v_id;
  perform private.settle_camera(v_id); -- a Legend's report verifies after one more confirmation
  return jsonb_build_object('id', v_id, 'status', (select status from public.community_cameras where id = v_id), 'existing', false);
end;
$$;

create or replace function public.vote_osm_camera(p_osm_id bigint, p_present boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.road_cameras where osm_id = p_osm_id) then return; end if;
  insert into public.osm_camera_votes (osm_id, user_id, present, weight) values (p_osm_id, v_uid, p_present, private.scout_weight(v_uid))
  on conflict (osm_id, user_id) do update set present = excluded.present, weight = excluded.weight, created_at = now();
end;
$$;

-- Everything community-made near a point, plus OpenStreetMap cameras drivers say are gone.
create or replace function public.community_cameras_near(p_lat double precision, p_lng double precision, p_radius_km double precision default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  with box as (
    select least(p_radius_km, 100) / 111.0 as dlat,
           least(p_radius_km, 100) / (111.0 * greatest(cos(radians(p_lat)), 0.05)) as dlng
  )
  select jsonb_build_object(
    'cameras', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'lat', c.lat, 'lng', c.lng, 'direction', c.direction, 'status', c.status,
        'present', c.present, 'gone', c.gone,
        'mine', c.created_by is not distinct from auth.uid() and auth.uid() is not null,
        'my_vote', (select v.present from public.camera_votes v where v.camera_id = c.id and v.user_id = auth.uid())
      ))
      from public.community_cameras c, box
      where c.status in ('pending', 'verified')
        and c.lat between p_lat - box.dlat and p_lat + box.dlat
        and c.lng between p_lng - box.dlng and p_lng + box.dlng
    ), '[]'::jsonb),
    'retired_osm', coalesce((
      select jsonb_agg(r.osm_id)
      from public.road_cameras r, box
      where r.lat between p_lat - box.dlat and p_lat + box.dlat
        and r.lng between p_lng - box.dlng and p_lng + box.dlng
        and (select coalesce(sum(case when not v.present then v.weight else 0 end), 0) from public.osm_camera_votes v where v.osm_id = r.osm_id) >= 3
        and (select coalesce(sum(case when not v.present then v.weight else -v.weight end), 0) from public.osm_camera_votes v where v.osm_id = r.osm_id) > 0
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.report_camera(text, double precision, double precision, real) from anon, public;
revoke execute on function public.vote_camera(uuid, boolean) from anon, public;
revoke execute on function public.vote_osm_camera(bigint, boolean) from anon, public;
revoke execute on function public.my_scout_stats() from anon, public;
revoke execute on function public.community_cameras_near(double precision, double precision, double precision) from public;
grant execute on function public.report_camera(text, double precision, double precision, real) to authenticated;
grant execute on function public.vote_camera(uuid, boolean) to authenticated;
grant execute on function public.vote_osm_camera(bigint, boolean) to authenticated;
grant execute on function public.my_scout_stats() to authenticated;
grant execute on function public.community_cameras_near(double precision, double precision, double precision) to anon, authenticated;
revoke execute on function private.scout_points(uuid) from anon, public;
revoke execute on function private.scout_weight(uuid) from anon, public;
revoke execute on function private.settle_camera(uuid) from anon, public;
