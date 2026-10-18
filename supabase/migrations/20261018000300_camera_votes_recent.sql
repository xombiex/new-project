-- Camera votes: retirement looks at the last 30 days, people can change their vote, and the
-- reporter's weight is stored so totals can be recomputed from the votes.
alter table public.community_cameras add column if not exists reporter_weight real not null default 1;

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
