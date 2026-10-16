create table public.road_reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('traffic', 'hazard', 'accident', 'closure', 'construction', 'disabled', 'police', 'weather')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirms int not null default 0,
  dismisses int not null default 0,
  status text not null default 'active' check (status in ('active', 'removed'))
);
create index road_reports_active_idx on public.road_reports(lat, lng) where status = 'active';
create index road_reports_creator_idx on public.road_reports(created_by, created_at);
-- RLS on, no policies: all access goes through the functions below, which never
-- expose created_by (a report reveals where someone was).
alter table public.road_reports enable row level security;

create table public.report_votes (
  report_id uuid not null references public.road_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  still_there boolean not null,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index report_votes_user_idx on public.report_votes(user_id);
alter table public.report_votes enable row level security;

create or replace function private.report_ttl(t text) returns interval language sql immutable as $$
  select case t
    when 'traffic' then interval '30 minutes'
    when 'police' then interval '45 minutes'
    when 'hazard' then interval '1 hour'
    when 'disabled' then interval '1 hour'
    when 'accident' then interval '90 minutes'
    when 'weather' then interval '3 hours'
    when 'closure' then interval '24 hours'
    when 'construction' then interval '7 days'
  end;
$$;

-- Great-circle distance in meters.
create or replace function private.dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

create or replace function public.reports_near(p_lat double precision, p_lng double precision, p_radius_km double precision default 30)
returns table (id uuid, type text, lat double precision, lng double precision, created_at timestamptz,
               expires_at timestamptz, confirms int, dismisses int, mine boolean, my_vote boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.type, r.lat, r.lng, r.created_at, r.expires_at, r.confirms, r.dismisses,
         r.created_by is not distinct from auth.uid() and auth.uid() is not null,
         (select v.still_there from public.report_votes v where v.report_id = r.id and v.user_id = auth.uid())
  from public.road_reports r
  where r.status = 'active' and r.expires_at > now()
    and r.lat between p_lat - least(p_radius_km, 100) / 111.0 and p_lat + least(p_radius_km, 100) / 111.0
    and r.lng between p_lng - least(p_radius_km, 100) / (111.0 * greatest(cos(radians(p_lat)), 0.05))
                  and p_lng + least(p_radius_km, 100) / (111.0 * greatest(cos(radians(p_lat)), 0.05))
  order by r.created_at desc
  limit 300;
$$;

create or replace function public.create_report(p_type text, p_lat double precision, p_lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if private.report_ttl(p_type) is null then raise exception 'unknown report type'; end if;
  if (select count(*) from public.road_reports where created_by = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'report limit reached';
  end if;

  -- Same thing already reported nearby: count this as a confirmation instead.
  select r.id into v_id from public.road_reports r
  where r.status = 'active' and r.expires_at > now() and r.type = p_type
    and r.lat between p_lat - 0.002 and p_lat + 0.002
    and private.dist_m(r.lat, r.lng, p_lat, p_lng) < 150
  order by r.created_at desc limit 1;

  if v_id is not null then
    perform public.vote_report(v_id, true);
    return v_id;
  end if;

  insert into public.road_reports (type, lat, lng, created_by, expires_at)
  values (p_type, p_lat, p_lng, v_uid, now() + private.report_ttl(p_type))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vote_report(p_id uuid, p_still_there boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.road_reports;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into r from public.road_reports where id = p_id for update;
  if r.id is null or r.status <> 'active' then return; end if;

  -- The reporter saying "not there" just removes their own report.
  if r.created_by = v_uid then
    if not p_still_there then update public.road_reports set status = 'removed' where id = p_id; end if;
    return;
  end if;

  insert into public.report_votes (report_id, user_id, still_there) values (p_id, v_uid, p_still_there)
  on conflict (report_id, user_id) do nothing;
  if not found then return; end if; -- one vote per person

  if p_still_there then
    update public.road_reports
      set confirms = confirms + 1,
          expires_at = greatest(expires_at, now() + private.report_ttl(type) / 2)
      where id = p_id;
  else
    update public.road_reports
      set dismisses = dismisses + 1,
          status = case when dismisses + 1 >= confirms + 2 then 'removed' else status end
      where id = p_id;
  end if;
end;
$$;

revoke execute on function public.reports_near(double precision, double precision, double precision) from public;
revoke execute on function public.create_report(text, double precision, double precision) from anon, public;
revoke execute on function public.vote_report(uuid, boolean) from anon, public;
grant execute on function public.reports_near(double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.create_report(text, double precision, double precision) to authenticated;
grant execute on function public.vote_report(uuid, boolean) to authenticated;
