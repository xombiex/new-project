-- For someone whose app hasn't sent their units yet: guess from where they drove most recently.
-- Rough boxes for the places that use miles (US, UK); everywhere else is metric. Once the app
-- opens it sends the real setting, which wins.
create or replace function private.guess_units(lng double precision, lat double precision)
returns text language sql immutable set search_path = '' as $$
  select case
    when lng is null or lat is null then null
    -- contiguous US, minus southern Canada east of Lake Huron and northern Mexico
    when lat between 24.5 and 49.0 and lng between -124.8 and -66.9
      and not (lat > 45.0 and lng > -83.0 and lng < -71.0)
      and not (lat > 43.0 and lng > -83.0 and lng < -76.0 and lat > 0.12 * lng + 52.6)
      and not (lat < 31.3 and lng < -106.5)
      and not (lng between -106.5 and -97.0 and lat < 31.7 - 0.63 * (lng + 106.4)) then 'imperial'  -- south of the Rio Grande
    when lat between 51.0 and 71.5 and lng between -180 and -129.9 then 'imperial'  -- Alaska
    when lat between 18.9 and 22.3 and lng between -160.3 and -154.8 then 'imperial' -- Hawaii
    when lat between 49.9 and 60.9 and lng between -8.2 and 1.8
      and not (lng < -5.4 and lat < 54.0) then 'imperial'                           -- UK, not Ireland's south
    else 'metric'
  end;
$$;

create or replace function public.weekly_recaps()
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
    coalesce(
      (select ns.units from public.notification_settings ns where ns.user_id = w.user_id),
      (select private.guess_units((t.path->0->>0)::double precision, (t.path->0->>1)::double precision)
         from public.trips t
         where t.user_id = w.user_id and jsonb_typeof(t.path) = 'array' and jsonb_array_length(t.path) > 0
         order by t.started_at desc limit 1)
    )
  from week w where w.d >= 1000;
$$;
