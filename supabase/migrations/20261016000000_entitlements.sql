-- Purchases are mirrored here by the revenuecat-webhook edge function (service role only).
create table public.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (entitlement in ('pro', 'cosmetics', 'club')),
  -- null = never expires (one-time purchase)
  expires_at timestamptz,
  source text not null default 'revenuecat',
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement)
);
alter table public.entitlements enable row level security;
create policy "read own entitlements" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policies: clients can never grant themselves anything.

create or replace function private.has_entitlement(u uuid, e text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements x
    where x.user_id = u
      and (x.expires_at is null or x.expires_at > now())
      and (x.entitlement = e or (e = 'cosmetics' and x.entitlement = 'pro'))
  );
$$;
revoke execute on function private.has_entitlement(uuid, text) from anon, public;
grant execute on function private.has_entitlement(uuid, text) to authenticated, service_role;

-- Free hosts get up to 6 people per drive; Pro hosts up to 50.
create or replace function public.join_drive(p_code text)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_drive public.group_drives;
  v_limit int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_drive from public.group_drives
    where code = upper(trim(p_code)) and status = 'active';
  if v_drive.id is null then raise exception 'drive not found'; end if;
  if exists (select 1 from public.group_members where drive_id = v_drive.id and user_id = v_uid) then
    return v_drive;
  end if;
  v_limit := case when private.has_entitlement(v_drive.owner_id, 'pro') then 50 else 6 end;
  if (select count(*) from public.group_members where drive_id = v_drive.id) >= v_limit then
    raise exception 'drive is full (limit %)', v_limit;
  end if;
  insert into public.group_members (drive_id, user_id) values (v_drive.id, v_uid);
  return v_drive;
end;
$$;
