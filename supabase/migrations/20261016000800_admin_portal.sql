-- ─── Admins ──────────────────────────────────────────────────────────────
-- Emails allowed to become admin. A user is an admin only if their email is listed AND
-- confirmed, so nobody can claim admin by signing up with someone else's address.
create table private.admin_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
-- Add your admin email(s) (lowercase). The live project already has the owner's address.
-- insert into private.admin_emails (email) values ('you@example.com');

create or replace function private.is_admin(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users au
    join private.admin_emails ae on ae.email = lower(au.email)
    where au.id = u and au.email_confirmed_at is not null
  );
$$;
revoke execute on function private.is_admin(uuid) from anon, public;
grant execute on function private.is_admin(uuid) to authenticated, service_role;

create table private.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'admin only' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;

create or replace function private.audit(p_action text, p_target text, p_details jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into private.admin_audit (admin_id, action, target, details) values (auth.uid(), p_action, p_target, p_details);
$$;

-- Admins can comp entitlements; those grants are never touched by RevenueCat/Stripe syncs.
alter table public.entitlements drop constraint entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check check (source in ('revenuecat', 'stripe', 'admin'));

-- ─── Admin API (all security definer + admin check) ──────────────────────

create or replace function public.admin_whoami()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin(auth.uid());
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'profiles', (select count(*) from public.profiles),
    'trips', (select count(*) from public.trips),
    'trip_km', (select coalesce(round(sum(distance_m) / 1000), 0) from public.trips),
    'active_drives', (select count(*) from public.group_drives where status = 'active'),
    'clubs', (select count(*) from public.clubs),
    'upcoming_events', (select count(*) from public.club_events where starts_at > now()),
    'active_reports', (select count(*) from public.road_reports where status = 'active' and expires_at > now()),
    'paid_tickets', (select count(*) from public.event_rsvps where paid),
    'entitlements', coalesce((
      select jsonb_object_agg(k, n) from (
        select entitlement || ':' || source as k, count(*) as n from public.entitlements
        where expires_at is null or expires_at > now() group by 1
      ) x), '{}'::jsonb),
    'banned', (select count(*) from auth.users where banned_until > now())
  );
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, username text, display_name text, avatar_color text, created_at timestamptz,
               last_sign_in_at timestamptz, email_confirmed boolean, banned_until timestamptz, is_admin boolean,
               entitlements text[], trips bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select au.id, au.email::text, p.username, p.display_name, p.avatar_color, au.created_at, au.last_sign_in_at,
           au.email_confirmed_at is not null, au.banned_until, private.is_admin(au.id),
           coalesce((select array_agg(distinct e.entitlement || ':' || e.source) from public.entitlements e
                     where e.user_id = au.id and (e.expires_at is null or e.expires_at > now())), '{}'),
           (select count(*) from public.trips t where t.user_id = au.id)
    from auth.users au
    left join public.profiles p on p.id = au.id
    where p_search is null or p_search = ''
       or au.email ilike '%' || p_search || '%'
       or p.username ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
       or au.id::text = p_search
    order by au.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'user', (select to_jsonb(x) from (select id, email, created_at, last_sign_in_at, email_confirmed_at, banned_until,
              raw_app_meta_data->>'provider' as provider from auth.users where id = p_user) x),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user),
    'entitlements', coalesce((select jsonb_agg(to_jsonb(e) order by e.entitlement) from public.entitlements e where e.user_id = p_user), '[]'),
    'stripe_customer', (select customer_id from public.stripe_customers where user_id = p_user),
    'trips', (select jsonb_build_object('count', count(*), 'km', coalesce(round(sum(distance_m) / 1000), 0), 'last', max(started_at))
              from public.trips where user_id = p_user),
    'friends', (select count(*) from public.friendships where status = 'accepted' and p_user in (requester_id, addressee_id)),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', m.role))
              from public.club_members m join public.clubs c on c.id = m.club_id where m.user_id = p_user), '[]'),
    'reports_7d', (select count(*) from public.road_reports where created_by = p_user and created_at > now() - interval '7 days'),
    'devices', (select count(*) from public.push_tokens where user_id = p_user)
  );
end;
$$;

create or replace function public.admin_set_entitlement(p_user uuid, p_entitlement text, p_grant boolean, p_days int default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_entitlement not in ('pro', 'club', 'cosmetics') then raise exception 'unknown entitlement'; end if;
  if p_grant then
    insert into public.entitlements (user_id, entitlement, source, expires_at)
    values (p_user, p_entitlement, 'admin', case when p_days is null then null else now() + make_interval(days => p_days) end)
    on conflict (user_id, entitlement, source) do update set expires_at = excluded.expires_at, updated_at = now();
  else
    delete from public.entitlements where user_id = p_user and entitlement = p_entitlement and source = 'admin';
  end if;
  perform private.audit(case when p_grant then 'grant_entitlement' else 'revoke_entitlement' end, p_user::text,
                        jsonb_build_object('entitlement', p_entitlement, 'days', p_days));
end;
$$;

-- Ban = block sign-in and token refresh (GoTrue honours banned_until). null hours = unban.
create or replace function public.admin_ban_user(p_user uuid, p_hours int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.require_admin();
begin
  if p_user = v_admin then raise exception 'you cannot ban yourself'; end if;
  if private.is_admin(p_user) then raise exception 'cannot ban another admin'; end if;
  update auth.users set banned_until = case when p_hours is null then null else now() + make_interval(hours => p_hours) end
  where id = p_user;
  if p_hours is not null then
    -- Stop sharing live data immediately.
    delete from public.user_locations where user_id = p_user;
    delete from public.group_members where user_id = p_user;
    delete from public.push_tokens where user_id = p_user;
  end if;
  perform private.audit(case when p_hours is null then 'unban' else 'ban' end, p_user::text, jsonb_build_object('hours', p_hours));
end;
$$;

create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_email text;
begin
  if p_user = v_admin then raise exception 'you cannot delete yourself'; end if;
  if private.is_admin(p_user) then raise exception 'cannot delete another admin'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'user not found'; end if;
  if lower(v_email) <> lower(trim(p_confirm_email)) then raise exception 'confirmation email does not match'; end if;
  perform private.audit('delete_user', p_user::text, jsonb_build_object('email', v_email));
  delete from auth.users where id = p_user; -- cascades to profiles, trips, friendships, etc.
end;
$$;

create or replace function public.admin_list_reports()
returns table (id uuid, type text, lat double precision, lng double precision, created_at timestamptz, expires_at timestamptz,
               confirms int, dismisses int, reporter text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select r.id, r.type, r.lat, r.lng, r.created_at, r.expires_at, r.confirms, r.dismisses, p.username
    from public.road_reports r left join public.profiles p on p.id = r.created_by
    where r.status = 'active' and r.expires_at > now()
    order by r.created_at desc limit 500;
end;
$$;

create or replace function public.admin_remove_report(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.road_reports set status = 'removed' where id = p_id;
  perform private.audit('remove_report', p_id::text, null);
end;
$$;

create or replace function public.admin_list_drives()
returns table (id uuid, name text, code text, owner text, members bigint, club text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select d.id, d.name, d.code, p.username, (select count(*) from public.group_members m where m.drive_id = d.id),
           c.name, d.created_at
    from public.group_drives d
    left join public.profiles p on p.id = d.owner_id
    left join public.clubs c on c.id = d.club_id
    where d.status = 'active' order by d.created_at desc limit 500;
end;
$$;

create or replace function public.admin_end_drive(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.group_drives set status = 'ended' where id = p_id;
  perform private.audit('end_drive', p_id::text, null);
end;
$$;

create or replace function public.admin_list_clubs()
returns table (id uuid, name text, color text, owner text, members bigint, upcoming_events bigint, payouts_ready boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select c.id, c.name, c.color, p.username,
           (select count(*) from public.club_members m where m.club_id = c.id),
           (select count(*) from public.club_events e where e.club_id = c.id and e.starts_at > now()),
           coalesce((select cp.charges_enabled from public.club_payouts cp where cp.club_id = c.id), false),
           c.created_at
    from public.clubs c left join public.profiles p on p.id = c.owner_id
    order by c.created_at desc limit 500;
end;
$$;

create or replace function public.admin_delete_club(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.audit('delete_club', p_id::text, (select jsonb_build_object('name', name) from public.clubs where id = p_id));
  delete from public.clubs where id = p_id;
end;
$$;

create or replace function public.admin_audit_log(p_limit int default 100)
returns table (id bigint, admin text, action text, target text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select a.id, coalesce(au.email::text, 'system'), a.action, a.target, a.details, a.created_at
    from private.admin_audit a left join auth.users au on au.id = a.admin_id
    order by a.id desc limit least(greatest(p_limit, 1), 500);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_whoami()', 'admin_stats()', 'admin_list_users(text, int, int)', 'admin_user_detail(uuid)',
    'admin_set_entitlement(uuid, text, boolean, int)', 'admin_ban_user(uuid, int)', 'admin_delete_user(uuid, text)',
    'admin_list_reports()', 'admin_remove_report(uuid)', 'admin_list_drives()', 'admin_end_drive(uuid)',
    'admin_list_clubs()', 'admin_delete_club(uuid)', 'admin_audit_log(int)'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
