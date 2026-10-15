-- ─── Profiles ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_color text not null default '#3B82F6' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ─── Friendships ─────────────────────────────────────────────────────────
create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index friendships_addressee_idx on public.friendships(addressee_id);
alter table public.friendships enable row level security;

create policy "participants read friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "send friend request" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
-- Only the recipient can accept or block a pending request.
create policy "recipient responds" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status in ('accepted', 'blocked'));
create policy "either side removes" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ─── Last-known location shared with friends (one row per user) ─────────
create table public.user_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  heading real,
  speed_mps real,
  accuracy_m real,
  updated_at timestamptz not null default now(),
  -- Sharing is opt-in and time-boxed; null means not sharing.
  share_until timestamptz
);
alter table public.user_locations enable row level security;

create policy "owner manages location" on public.user_locations
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "friends read active shares" on public.user_locations
  for select to authenticated
  using (share_until > now() and public.are_friends(user_id, (select auth.uid())));

-- ─── Trips ───────────────────────────────────────────────────────────────
create table public.trips (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name text check (char_length(name) <= 80),
  notes text check (char_length(notes) <= 1000),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m double precision not null check (distance_m >= 0),
  moving_s integer not null check (moving_s >= 0),
  max_speed_mps real not null check (max_speed_mps >= 0),
  -- Simplified route as [[lng, lat], ...]
  path jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index trips_user_started_idx on public.trips(user_id, started_at desc);
alter table public.trips enable row level security;

create policy "owner manages trips" on public.trips
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── Group drives ────────────────────────────────────────────────────────
create table public.group_drives (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  destination_name text,
  dest_lat double precision,
  dest_lng double precision,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now()
);
alter table public.group_drives enable row level security;

create table public.group_members (
  drive_id uuid not null references public.group_drives(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (drive_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);
alter table public.group_members enable row level security;

create or replace function public.is_drive_member(d uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.drive_id = d and m.user_id = u);
$$;

create policy "members read drive" on public.group_drives
  for select to authenticated using (public.is_drive_member(id, (select auth.uid())));
create policy "owner updates drive" on public.group_drives
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "members read roster" on public.group_members
  for select to authenticated using (public.is_drive_member(drive_id, (select auth.uid())));
create policy "member leaves" on public.group_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- Creating and joining go through RPCs so codes can't be enumerated via selects.
create or replace function public.create_drive(p_name text, p_destination_name text default null,
  p_dest_lat double precision default null, p_dest_lng double precision default null)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_drive public.group_drives;
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.group_drives where owner_id = v_uid and status = 'active') >= 3 then
    raise exception 'too many active drives';
  end if;
  loop
    -- 6 chars from an unambiguous alphabet
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.group_drives where code = v_code);
  end loop;
  insert into public.group_drives (code, name, owner_id, destination_name, dest_lat, dest_lng)
    values (v_code, p_name, v_uid, p_destination_name, p_dest_lat, p_dest_lng)
    returning * into v_drive;
  insert into public.group_members (drive_id, user_id) values (v_drive.id, v_uid);
  return v_drive;
end;
$$;

create or replace function public.join_drive(p_code text)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_drive public.group_drives;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_drive from public.group_drives
    where code = upper(trim(p_code)) and status = 'active';
  if v_drive.id is null then raise exception 'drive not found'; end if;
  if (select count(*) from public.group_members where drive_id = v_drive.id) >= 50 then
    raise exception 'drive is full';
  end if;
  insert into public.group_members (drive_id, user_id) values (v_drive.id, v_uid)
    on conflict do nothing;
  return v_drive;
end;
$$;

revoke execute on function public.create_drive(text, text, double precision, double precision) from anon, public;
revoke execute on function public.join_drive(text) from anon, public;
revoke execute on function public.are_friends(uuid, uuid) from anon, public;
revoke execute on function public.is_drive_member(uuid, uuid) from anon, public;
grant execute on function public.create_drive(text, text, double precision, double precision) to authenticated;
grant execute on function public.join_drive(text) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_drive_member(uuid, uuid) to authenticated;

-- ─── Realtime authorization: private channel "drive:<uuid>" members only ─
create policy "drive members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'drive:%'
    and public.is_drive_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid, (select auth.uid()))
  );
create policy "drive members send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'drive:%'
    and public.is_drive_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid, (select auth.uid()))
  );
