-- The club plan includes everything in Pro, and Pro includes cosmetics.
create or replace function private.has_entitlement(u uuid, e text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements x
    where x.user_id = u
      and (x.expires_at is null or x.expires_at > now())
      and (x.entitlement = e
           or (e = 'pro' and x.entitlement = 'club')
           or (e = 'cosmetics' and x.entitlement in ('pro', 'club')))
  );
$$;

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 50),
  description text check (char_length(description) <= 500),
  color text not null default '#1E9BFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create index clubs_owner_idx on public.clubs(owner_id);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members(user_id);

create table public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  meet_name text, meet_lat double precision, meet_lng double precision,
  dest_name text, dest_lat double precision, dest_lng double precision,
  price_cents int not null default 0 check (price_cents >= 0 and price_cents <= 100000),
  currency text not null default 'usd',
  capacity int check (capacity is null or capacity > 0),
  drive_id uuid references public.group_drives(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reminder_sent_at timestamptz
);
create index club_events_club_idx on public.club_events(club_id, starts_at);
create index club_events_starts_idx on public.club_events(starts_at) where reminder_sent_at is null;

create table public.event_rsvps (
  event_id uuid not null references public.club_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested', 'not_going')),
  paid boolean not null default false,
  stripe_session_id text,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps(user_id);

alter table public.group_drives add column club_id uuid references public.clubs(id) on delete set null;

create or replace function private.club_role(c uuid, u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.club_members where club_id = c and user_id = u;
$$;
revoke execute on function private.club_role(uuid, uuid) from anon, public;
grant execute on function private.club_role(uuid, uuid) to authenticated, service_role;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_events enable row level security;
alter table public.event_rsvps enable row level security;

create policy "members read club" on public.clubs for select to authenticated
  using (private.club_role(id, (select auth.uid())) is not null);
create policy "admins update club" on public.clubs for update to authenticated
  using (private.club_role(id, (select auth.uid())) in ('owner', 'admin'))
  with check (private.club_role(id, (select auth.uid())) in ('owner', 'admin'));
create policy "owner deletes club" on public.clubs for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "members read roster" on public.club_members for select to authenticated
  using (private.club_role(club_id, (select auth.uid())) is not null);
create policy "leave or remove" on public.club_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role <> 'owner')
         or (private.club_role(club_id, (select auth.uid())) in ('owner', 'admin') and role = 'member'));
create policy "owner sets roles" on public.club_members for update to authenticated
  using (private.club_role(club_id, (select auth.uid())) = 'owner' and role <> 'owner')
  with check (role in ('admin', 'member'));

create policy "members read events" on public.club_events for select to authenticated
  using (private.club_role(club_id, (select auth.uid())) is not null);
create policy "admins create events" on public.club_events for insert to authenticated
  with check (private.club_role(club_id, (select auth.uid())) in ('owner', 'admin') and created_by = (select auth.uid()) and drive_id is null);
create policy "admins edit events" on public.club_events for update to authenticated
  using (private.club_role(club_id, (select auth.uid())) in ('owner', 'admin'))
  with check (private.club_role(club_id, (select auth.uid())) in ('owner', 'admin'));
create policy "admins delete events" on public.club_events for delete to authenticated
  using (private.club_role(club_id, (select auth.uid())) in ('owner', 'admin'));

create policy "members read rsvps" on public.event_rsvps for select to authenticated
  using (private.club_role((select e.club_id from public.club_events e where e.id = event_id), (select auth.uid())) is not null);
-- Free events: members RSVP freely. Paid events: 'going' + paid is set only by the Stripe webhook.
create policy "member rsvps" on public.event_rsvps for insert to authenticated
  with check (
    user_id = (select auth.uid()) and paid = false
    and private.club_role((select e.club_id from public.club_events e where e.id = event_id), (select auth.uid())) is not null
    and (status <> 'going' or (select e.price_cents from public.club_events e where e.id = event_id) = 0)
  );
create policy "member updates rsvp" on public.event_rsvps for update to authenticated
  using (user_id = (select auth.uid()) and paid = false)
  with check (user_id = (select auth.uid()) and paid = false
    and (status <> 'going' or (select e.price_cents from public.club_events e where e.id = event_id) = 0));
create policy "member removes rsvp" on public.event_rsvps for delete to authenticated
  using (user_id = (select auth.uid()) and paid = false);

-- Capacity: count paid + free "going".
create or replace function private.check_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int;
begin
  if new.status <> 'going' then return new; end if;
  select capacity into cap from public.club_events where id = new.event_id;
  if cap is not null and (select count(*) from public.event_rsvps
       where event_id = new.event_id and status = 'going' and user_id <> new.user_id) >= cap then
    raise exception 'event is full';
  end if;
  return new;
end;
$$;
create trigger event_rsvps_capacity before insert or update on public.event_rsvps
  for each row execute function private.check_capacity();

create or replace function private.random_code(n int) returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, n);
$$;

create or replace function public.create_club(p_name text, p_color text default '#1E9BFF', p_description text default null)
returns public.clubs language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_club public.clubs;
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.has_entitlement(v_uid, 'club') then raise exception 'club plan required'; end if;
  if (select count(*) from public.clubs where owner_id = v_uid) >= 3 then raise exception 'club limit reached'; end if;
  loop
    v_code := private.random_code(8);
    exit when not exists (select 1 from public.clubs where invite_code = v_code);
  end loop;
  insert into public.clubs (name, color, description, owner_id, invite_code)
    values (trim(p_name), p_color, p_description, v_uid, v_code) returning * into v_club;
  insert into public.club_members (club_id, user_id, role) values (v_club.id, v_uid, 'owner');
  return v_club;
end;
$$;

create or replace function public.join_club(p_code text)
returns public.clubs language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_club public.clubs;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_club from public.clubs where invite_code = upper(trim(p_code));
  if v_club.id is null then raise exception 'club not found'; end if;
  if (select count(*) from public.club_members where club_id = v_club.id) >= 500 then raise exception 'club is full'; end if;
  insert into public.club_members (club_id, user_id) values (v_club.id, v_uid) on conflict do nothing;
  return v_club;
end;
$$;

-- Owners/admins start a club drive (optionally from an event); members join it without a code.
-- club_role() is NULL for non-members and NULL NOT IN (...) is not true, hence the coalesce.
create or replace function public.start_club_drive(p_club uuid, p_event uuid default null)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ev public.club_events;
  v_drive public.group_drives;
  v_name text;
begin
  if coalesce(private.club_role(p_club, v_uid), '') not in ('owner', 'admin') then raise exception 'not allowed'; end if;
  if p_event is not null then
    select * into v_ev from public.club_events where id = p_event and club_id = p_club;
    if v_ev.id is null then raise exception 'event not found'; end if;
    if v_ev.drive_id is not null then
      select * into v_drive from public.group_drives where id = v_ev.drive_id and status = 'active';
      if v_drive.id is not null then return v_drive; end if;
    end if;
  end if;
  select name into v_name from public.clubs where id = p_club;
  insert into public.group_drives (code, name, owner_id, destination_name, dest_lat, dest_lng, club_id)
    values (private.random_code(6), coalesce(v_ev.title, v_name || ' drive'), v_uid, v_ev.dest_name, v_ev.dest_lat, v_ev.dest_lng, p_club)
    returning * into v_drive;
  insert into public.group_members (drive_id, user_id) values (v_drive.id, v_uid);
  if v_ev.id is not null then update public.club_events set drive_id = v_drive.id where id = v_ev.id; end if;
  return v_drive;
end;
$$;

create or replace function public.join_club_drive(p_drive uuid)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_drive public.group_drives;
begin
  select * into v_drive from public.group_drives where id = p_drive and status = 'active';
  if v_drive.id is null or v_drive.club_id is null then raise exception 'drive not found'; end if;
  if private.club_role(v_drive.club_id, v_uid) is null then raise exception 'not a club member'; end if;
  insert into public.group_members (drive_id, user_id) values (v_drive.id, v_uid) on conflict do nothing;
  return v_drive;
end;
$$;

-- Active club drives are visible to club members (so they can join without a code).
create policy "club members see club drives" on public.group_drives for select to authenticated
  using (club_id is not null and private.club_role(club_id, (select auth.uid())) is not null);

-- Club drives allow up to 100 people; Pro hosts 50; free 6.
create or replace function public.join_drive(p_code text)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_drive public.group_drives;
  v_limit int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_drive from public.group_drives where code = upper(trim(p_code)) and status = 'active';
  if v_drive.id is null then raise exception 'drive not found'; end if;
  if exists (select 1 from public.group_members where drive_id = v_drive.id and user_id = v_uid) then return v_drive; end if;
  v_limit := case
    when v_drive.club_id is not null then 100
    when private.has_entitlement(v_drive.owner_id, 'pro') then 50
    else 6 end;
  if (select count(*) from public.group_members where drive_id = v_drive.id) >= v_limit then
    raise exception 'drive is full (limit %)', v_limit;
  end if;
  insert into public.group_members (drive_id, user_id) values (v_drive.id, v_uid);
  return v_drive;
end;
$$;

revoke execute on function public.create_club(text, text, text) from anon, public;
revoke execute on function public.join_club(text) from anon, public;
revoke execute on function public.start_club_drive(uuid, uuid) from anon, public;
revoke execute on function public.join_club_drive(uuid) from anon, public;
grant execute on function public.create_club(text, text, text) to authenticated;
grant execute on function public.join_club(text) to authenticated;
grant execute on function public.start_club_drive(uuid, uuid) to authenticated;
grant execute on function public.join_club_drive(uuid) to authenticated;

-- Stripe Connect accounts for paid events (owner-visible; written by the stripe function).
create table public.club_payouts (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  stripe_account_id text not null,
  charges_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.club_payouts enable row level security;
create policy "owner reads payouts" on public.club_payouts for select to authenticated
  using (private.club_role(club_id, (select auth.uid())) = 'owner');

-- Lets the notify function verify calls from the scheduled job (service role only).
create or replace function public.cron_secret_ok(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'notify_cron_secret' and decrypted_secret = p);
$$;
revoke execute on function public.cron_secret_ok(text) from anon, authenticated, public;
grant execute on function public.cron_secret_ok(text) to service_role;
