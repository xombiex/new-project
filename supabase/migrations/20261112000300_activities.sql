-- Shared drives ("activities"): the thing the feed is made of.
--
-- A drive is private until its owner shares it. Sharing makes one row here, for friends, for one
-- club, or both. The row carries its own copy of the numbers and a small route preview that the
-- app has already trimmed (both ends cut, privacy zones removed), so the full drive in `trips`
-- never becomes readable by anyone else. Top speed is deliberately not copied.

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid not null unique references public.trips(id) on delete cascade,
  to_friends boolean not null default true,
  club_id uuid references public.clubs(id) on delete set null,
  title text check (char_length(title) <= 80),
  started_at timestamptz not null,
  distance_m double precision not null check (distance_m >= 0),
  moving_s integer not null check (moving_s >= 0),
  car_label text,
  car_body text,
  car_paint text,
  -- [[[lng, lat], ...], ...]: one or more pieces of road
  preview jsonb not null default '[]'::jsonb,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index activities_user_idx on public.activities(user_id, created_at desc, id desc);
create index activities_club_idx on public.activities(club_id, created_at desc, id desc) where club_id is not null;
create index activities_recent_idx on public.activities(created_at desc, id desc);
alter table public.activities enable row level security;

-- Mine; or a friend's that is shared with friends; or one shared with a club I'm in. Never across a block.
create policy "read shared activities" on public.activities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      not private.is_blocked(user_id, (select auth.uid()))
      and (
        (to_friends and private.are_friends(user_id, (select auth.uid())))
        or (club_id is not null and private.club_role(club_id, (select auth.uid())) is not null)
      )
    )
  );
create policy "owner unshares" on public.activities
  for delete to authenticated using (user_id = (select auth.uid()));

-- Sharing goes through here so the numbers come from the caller's own drive, not from the request.
create or replace function public.share_trip(p_trip uuid, p_to_friends boolean, p_club uuid, p_title text, p_preview jsonb)
returns public.activities language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips;
  v_row public.activities;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_trip from public.trips where id = p_trip and user_id = v_uid;
  if v_trip.id is null then raise exception 'drive not found'; end if;
  if not coalesce(p_to_friends, false) and p_club is null then raise exception 'choose who can see it'; end if;
  if p_club is not null and private.club_role(p_club, v_uid) is null then raise exception 'not a club member'; end if;
  if jsonb_typeof(p_preview) <> 'array' or length(p_preview::text) > 24000 then raise exception 'route preview too large'; end if;
  if not exists (select 1 from public.activities where trip_id = p_trip)
     and (select count(*) from public.activities where user_id = v_uid and created_at > now() - interval '1 day') >= 40 then
    raise exception 'too many drives shared today';
  end if;
  insert into public.activities (user_id, trip_id, to_friends, club_id, title, started_at, distance_m, moving_s, car_label, car_body, car_paint, preview)
    values (v_uid, p_trip, coalesce(p_to_friends, false), p_club, nullif(btrim(left(coalesce(p_title, v_trip.name, ''), 80)), ''),
            v_trip.started_at, v_trip.distance_m, v_trip.moving_s, v_trip.car_label, v_trip.car_body, v_trip.car_paint, p_preview)
    on conflict (trip_id) do update
      set to_friends = excluded.to_friends, club_id = excluded.club_id, title = excluded.title, preview = excluded.preview
    returning * into v_row;
  return v_row;
end;
$$;
