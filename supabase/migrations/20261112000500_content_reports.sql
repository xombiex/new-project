-- Reporting a person, a shared drive or a comment to the Convoy team.
-- (Not to be confused with road_reports, which are hazards on the map.)

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_kind text not null check (target_kind in ('user', 'activity', 'comment')),
  target_id uuid not null,
  -- who the report is about, whichever kind it is
  target_user uuid references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'dangerous', 'inappropriate', 'other')),
  details text check (char_length(details) <= 500),
  -- what was reported, as it read at the time (a comment can be edited away or deleted)
  snapshot text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  unique (reporter_id, target_kind, target_id)
);
create index content_reports_open_idx on public.content_reports(created_at desc) where status = 'open';
create index content_reports_target_user_idx on public.content_reports(target_user);
-- No policies: written through report_content, read through the admin functions.
alter table public.content_reports enable row level security;

create or replace function public.report_content(p_kind text, p_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_snapshot text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.content_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many reports today';
  end if;
  if p_kind = 'user' then
    select id, display_name || ' (@' || username || ')' into v_target, v_snapshot from public.profiles where id = p_id;
  elsif p_kind = 'activity' then
    select user_id, coalesce(title, 'Untitled drive') into v_target, v_snapshot from public.activities where id = p_id;
  elsif p_kind = 'comment' then
    select user_id, body into v_target, v_snapshot from public.activity_comments where id = p_id;
  else
    raise exception 'unknown report kind';
  end if;
  if v_target is null then raise exception 'not found'; end if;
  if v_target = v_uid then raise exception 'you cannot report yourself'; end if;
  insert into public.content_reports (reporter_id, target_kind, target_id, target_user, reason, details, snapshot)
    values (v_uid, p_kind, p_id, v_target, p_reason, nullif(btrim(left(coalesce(p_details, ''), 500)), ''), v_snapshot)
    on conflict (reporter_id, target_kind, target_id) do nothing;
end;
$$;

create or replace function public.admin_list_content_reports()
returns table (id uuid, kind text, target_id uuid, reported text, reported_id uuid, reporter text, reason text, details text, snapshot text, reports_against bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select r.id, r.target_kind, r.target_id, t.username, r.target_user, p.username, r.reason, r.details, r.snapshot,
           (select count(*) from public.content_reports x where x.target_user = r.target_user),
           r.created_at
    from public.content_reports r
    left join public.profiles t on t.id = r.target_user
    left join public.profiles p on p.id = r.reporter_id
    where r.status = 'open' order by r.created_at desc limit 500;
end;
$$;

-- p_remove: also take down the comment or shared drive (the drive itself stays in its owner's log).
create or replace function public.admin_resolve_content_report(p_id uuid, p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.content_reports;
begin
  perform private.require_admin();
  select * into r from public.content_reports where id = p_id;
  if r.id is null then raise exception 'report not found'; end if;
  if p_remove then
    if r.target_kind = 'comment' then delete from public.activity_comments where id = r.target_id;
    elsif r.target_kind = 'activity' then delete from public.activities where id = r.target_id;
    end if;
  end if;
  -- Every open report about the same thing is settled together.
  update public.content_reports
    set status = case when p_remove then 'actioned' else 'dismissed' end, resolved_at = now(), resolved_by = auth.uid()
    where target_kind = r.target_kind and target_id = r.target_id and status = 'open';
  perform private.audit(case when p_remove then 'content_report_actioned' else 'content_report_dismissed' end, p_id::text,
    jsonb_build_object('kind', r.target_kind, 'target', r.target_id, 'reason', r.reason));
end;
$$;

revoke execute on function public.report_content(text, uuid, text, text) from anon, public;
revoke execute on function public.admin_list_content_reports() from anon, public;
revoke execute on function public.admin_resolve_content_report(uuid, boolean) from anon, public;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.admin_list_content_reports() to authenticated;
grant execute on function public.admin_resolve_content_report(uuid, boolean) to authenticated;
