-- "Share my ETA": a private link anyone can open (no account) to watch you drive to a place, with
-- your arrival time. It only works with the unguessable token in the link, stops updating when
-- you arrive or end navigation, and expires after 6 hours. Rows are purged a day later.
create table public.eta_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  user_id uuid not null references auth.users(id) on delete cascade,
  dest_name text not null check (char_length(dest_name) between 1 and 120),
  dest_lat double precision not null check (dest_lat between -90 and 90),
  dest_lng double precision not null check (dest_lng between -180 and 180),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  heading real,
  speed real,
  eta_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  ended_at timestamptz,
  arrived boolean not null default false
);
create index eta_shares_user_idx on public.eta_shares(user_id, created_at);
-- No policies: owners write through the functions below; viewers read one share by its token.
alter table public.eta_shares enable row level security;

create or replace function public.start_eta_share(p_dest_name text, p_dest_lat double precision, p_dest_lng double precision, p_lat double precision, p_lng double precision, p_eta_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.eta_shares where user_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'share limit reached';
  end if;
  -- One live share at a time: a new one ends the previous.
  update public.eta_shares set ended_at = now() where user_id = v_uid and ended_at is null;
  insert into public.eta_shares (user_id, dest_name, dest_lat, dest_lng, lat, lng, eta_at)
  values (v_uid, left(btrim(p_dest_name), 120), p_dest_lat, p_dest_lng, p_lat, p_lng, p_eta_at)
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.update_eta_share(p_token text, p_lat double precision, p_lng double precision, p_heading real, p_speed real, p_eta_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  update public.eta_shares
     set lat = p_lat, lng = p_lng, heading = p_heading, speed = p_speed, eta_at = p_eta_at, updated_at = now()
   where token = p_token and user_id = auth.uid() and ended_at is null and expires_at > now();
$$;

create or replace function public.end_eta_share(p_token text, p_arrived boolean)
returns void language sql security definer set search_path = '' as $$
  update public.eta_shares set ended_at = now(), arrived = p_arrived, updated_at = now()
   where token = p_token and user_id = auth.uid() and ended_at is null;
$$;

-- What the share page shows. Nothing once it has expired.
create or replace function public.get_eta_share(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', coalesce(split_part(p.display_name, ' ', 1), 'Your friend'),
    'color', p.avatar_color,
    'dest_name', s.dest_name, 'dest_lat', s.dest_lat, 'dest_lng', s.dest_lng,
    'lat', s.lat, 'lng', s.lng, 'heading', s.heading, 'speed', s.speed,
    'eta_at', s.eta_at, 'updated_at', s.updated_at,
    'ended', s.ended_at is not null, 'arrived', s.arrived
  )
  from public.eta_shares s
  left join public.profiles p on p.id = s.user_id
  where s.token = p_token and s.expires_at > now();
$$;

revoke execute on function public.start_eta_share(text, double precision, double precision, double precision, double precision, timestamptz) from anon, public;
revoke execute on function public.update_eta_share(text, double precision, double precision, real, real, timestamptz) from anon, public;
revoke execute on function public.end_eta_share(text, boolean) from anon, public;
revoke execute on function public.get_eta_share(text) from public;
grant execute on function public.start_eta_share(text, double precision, double precision, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.update_eta_share(text, double precision, double precision, real, real, timestamptz) to authenticated;
grant execute on function public.end_eta_share(text, boolean) to authenticated;
grant execute on function public.get_eta_share(text) to anon, authenticated;

select cron.schedule('purge-old-eta-shares', '17 4 * * *', $$ delete from public.eta_shares where expires_at < now() - interval '1 day' $$);
