-- Blocking that the blocked person can't undo, and a limit on guessing join codes.
--
-- Before this, a block was a friendships row with status 'blocked', and the person who had been
-- blocked could delete that row and ask again. Blocks now live in their own table that only the
-- blocker can see or change, and they work in both directions.

-- ─── Blocks ──────────────────────────────────────────────────────────────
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);
alter table public.blocks enable row level security;

-- Only the blocker ever sees a block. Writes go through block_user / unblock_user.
create policy "read own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

/** True when either person has blocked the other. */
create or replace function private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

-- Old-style blocks move across, then stop being a friendship status anyone can set.
insert into public.blocks (blocker_id, blocked_id, created_at)
  select addressee_id, requester_id, created_at from public.friendships where status = 'blocked'
  on conflict do nothing;
delete from public.friendships where status = 'blocked';

drop policy "recipient responds" on public.friendships;
create policy "recipient responds" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Friend requests: not across a block, not when one already exists the other way round, and not
-- in bulk.
create or replace function private.check_friend_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_blocked(new.requester_id, new.addressee_id) then
    raise exception 'request not sent' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.friendships f
             where f.requester_id = new.addressee_id and f.addressee_id = new.requester_id) then
    raise exception 'request already exists' using errcode = '23505';
  end if;
  if (select count(*) from public.friendships f
      where f.requester_id = new.requester_id and f.created_at > now() - interval '1 day') >= 40 then
    raise exception 'too many friend requests today' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger friendships_check_request before insert on public.friendships
  for each row execute function private.check_friend_request();

-- Friends-only data (live location, garage, presence) also stops at a block.
create or replace function private.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  ) and not private.is_blocked(a, b);
$$;

create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_user = v_uid then raise exception 'you cannot block yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user not found'; end if;
  if (select count(*) from public.blocks where blocker_id = v_uid) >= 500 then raise exception 'block list is full'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user) on conflict do nothing;
  delete from public.friendships
    where (requester_id = v_uid and addressee_id = p_user) or (requester_id = p_user and addressee_id = v_uid);
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

/** The people I've blocked, newest first. */
create or replace function public.my_blocks()
returns table (id uuid, username text, display_name text, avatar_color text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_color, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke execute on function public.block_user(uuid) from anon, public;
revoke execute on function public.unblock_user(uuid) from anon, public;
revoke execute on function public.my_blocks() from anon, public;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;

-- ─── Join codes can't be guessed in bulk ─────────────────────────────────
-- A wrong code is written down, and after 8 wrong codes in 10 minutes the caller is locked out.
-- Wrong codes now return null instead of raising: an exception would roll the count back.
create table private.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index join_attempts_user_idx on private.join_attempts(user_id, created_at);

create or replace function private.join_locked(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) >= 8 from private.join_attempts
  where user_id = p_user and created_at > now() - interval '10 minutes';
$$;

create or replace function public.join_drive(p_code text)
returns public.group_drives language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_drive public.group_drives;
  v_limit int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if private.join_locked(v_uid) then raise exception 'too many wrong codes, try again in a few minutes'; end if;
  select * into v_drive from public.group_drives where code = upper(trim(p_code)) and status = 'active';
  if v_drive.id is null then
    insert into private.join_attempts (user_id, kind) values (v_uid, 'drive');
    return null;
  end if;
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

create or replace function public.join_club(p_code text)
returns public.clubs language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_club public.clubs;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if private.join_locked(v_uid) then raise exception 'too many wrong codes, try again in a few minutes'; end if;
  select * into v_club from public.clubs where invite_code = upper(trim(p_code));
  if v_club.id is null then
    insert into private.join_attempts (user_id, kind) values (v_uid, 'club');
    return null;
  end if;
  if (select count(*) from public.club_members where club_id = v_club.id) >= 500 then raise exception 'club is full'; end if;
  insert into public.club_members (club_id, user_id) values (v_club.id, v_uid) on conflict do nothing;
  return v_club;
end;
$$;
