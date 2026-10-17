-- Friends leaderboard: weekly/monthly distance, drives and drive days for you and your accepted
-- friends. Ranked by distance (never speed). Only totals leave the database, not routes or times.
-- People can opt out with profiles.leaderboard = false (they still see their own row).
alter table public.profiles add column if not exists leaderboard boolean not null default true;

create or replace function public.friends_leaderboard(p_since timestamptz)
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  vehicle text,
  vehicle_color text,
  distance_m double precision,
  drives int,
  drive_days int,
  is_me boolean
)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  people as (
    select id from me where id is not null
    union
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end
    from public.friendships f, me
    where f.status = 'accepted' and me.id in (f.requester_id, f.addressee_id)
  )
  select
    p.id,
    pr.display_name,
    pr.avatar_color,
    pr.vehicle,
    pr.vehicle_color,
    coalesce(sum(t.distance_m), 0)::double precision,
    count(t.id)::int,
    count(distinct (t.started_at at time zone 'UTC')::date)::int,
    p.id = (select id from me)
  from people p
  join public.profiles pr on pr.id = p.id
  left join public.trips t
    on t.user_id = p.id
   and t.role = 'driver'
   and t.started_at >= greatest(p_since, now() - interval '400 days')
  where pr.leaderboard or p.id = (select id from me)
  group by p.id, pr.display_name, pr.avatar_color, pr.vehicle, pr.vehicle_color
  order by 6 desc, 7 desc;
$$;

revoke all on function public.friends_leaderboard(timestamptz) from public, anon;
grant execute on function public.friends_leaderboard(timestamptz) to authenticated;
