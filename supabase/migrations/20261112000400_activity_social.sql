-- Likes and comments on shared drives, the notices they create, and "is this person driving".

-- ─── Likes ───────────────────────────────────────────────────────────────
create table public.activity_likes (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index activity_likes_user_idx on public.activity_likes(user_id);
alter table public.activity_likes enable row level security;

-- "exists in activities" runs under the reader's own access, so only what they can see counts.
create policy "read likes on visible activities" on public.activity_likes
  for select to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id));
create policy "like a visible activity" on public.activity_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.activities a where a.id = activity_id));
create policy "unlike" on public.activity_likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ─── Comments ────────────────────────────────────────────────────────────
create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index activity_comments_activity_idx on public.activity_comments(activity_id, created_at desc, id desc);
create index activity_comments_user_idx on public.activity_comments(user_id, created_at);
alter table public.activity_comments enable row level security;

create policy "read comments on visible activities" on public.activity_comments
  for select to authenticated
  using (
    exists (select 1 from public.activities a where a.id = activity_id)
    and not private.is_blocked(user_id, (select auth.uid()))
  );
create policy "comment on a visible activity" on public.activity_comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.activities a where a.id = activity_id));
-- The writer can take a comment back; the drive's owner can remove any comment on it.
create policy "remove own comment or on own activity" on public.activity_comments
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.activities a where a.id = activity_id and a.user_id = (select auth.uid()))
  );

-- ─── Notices in the inbox ────────────────────────────────────────────────
-- The inbox table that already holds announcements also holds "X liked your drive".
alter table public.messages
  add column kind text not null default 'announcement' check (kind in ('announcement', 'like', 'comment')),
  add column actor_id uuid references public.profiles(id) on delete cascade,
  add column activity_id uuid references public.activities(id) on delete cascade;
create index messages_activity_idx on public.messages(activity_id) where activity_id is not null;
create index messages_actor_idx on public.messages(actor_id) where actor_id is not null;

alter table public.notification_settings
  add column likes boolean not null default true,
  add column comments boolean not null default true;

create or replace function private.on_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_title text;
  v_name text;
begin
  if tg_op = 'DELETE' then
    update public.activities set like_count = greatest(like_count - 1, 0) where id = old.activity_id;
    return old;
  end if;
  update public.activities set like_count = like_count + 1 where id = new.activity_id
    returning user_id, title into v_owner, v_title;
  -- One notice per person per drive, however often they tap.
  if v_owner is not null and v_owner <> new.user_id
     and not exists (select 1 from public.messages m where m.user_id = v_owner and m.kind = 'like' and m.activity_id = new.activity_id and m.actor_id = new.user_id) then
    select display_name into v_name from public.profiles where id = new.user_id;
    insert into public.messages (user_id, kind, actor_id, activity_id, title, body)
      values (v_owner, 'like', new.user_id, new.activity_id, format('%s liked your drive', v_name), coalesce(v_title, 'Your shared drive'));
  end if;
  return new;
end;
$$;
create trigger activity_likes_count after insert or delete on public.activity_likes
  for each row execute function private.on_like();

create or replace function private.check_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.activity_comments c
      where c.user_id = new.user_id and c.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too many comments, slow down' using errcode = 'P0001';
  end if;
  new.body := btrim(new.body);
  return new;
end;
$$;
create trigger activity_comments_check before insert on public.activity_comments
  for each row execute function private.check_comment();

create or replace function private.on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_name text;
begin
  if tg_op = 'DELETE' then
    update public.activities set comment_count = greatest(comment_count - 1, 0) where id = old.activity_id;
    return old;
  end if;
  update public.activities set comment_count = comment_count + 1 where id = new.activity_id
    returning user_id into v_owner;
  if v_owner is not null and v_owner <> new.user_id and not private.is_blocked(v_owner, new.user_id) then
    select display_name into v_name from public.profiles where id = new.user_id;
    insert into public.messages (user_id, kind, actor_id, activity_id, title, body)
      values (v_owner, 'comment', new.user_id, new.activity_id, format('%s commented on your drive', v_name), left(new.body, 140));
  end if;
  return new;
end;
$$;
create trigger activity_comments_count after insert or delete on public.activity_comments
  for each row execute function private.on_comment();

-- A page of comments, newest first, with who wrote each. Runs as the reader, so RLS decides.
create or replace function public.activity_comments_page(p_activity uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 30)
returns table (id uuid, activity_id uuid, user_id uuid, username text, display_name text, avatar_color text, body text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.activity_id, c.user_id, p.username, p.display_name, p.avatar_color, c.body, c.created_at
  from public.activity_comments c join public.profiles p on p.id = c.user_id
  where c.activity_id = p_activity
    and (p_before is null or (c.created_at, c.id) < (p_before, p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

-- ─── Reading the feed ────────────────────────────────────────────────────
-- One reader for every list of activities, so each returns the same shape and the same rules.
--   scope 'home': mine, my friends', my clubs'      scope 'club': one club's (p_club)
--   scope 'user': one person's (p_user)             scope 'one':  a single activity (p_activity)
-- Pages by (created_at, id): pass the last row's pair as p_before / p_before_id for the next page.
create or replace function public.activity_feed(
  p_scope text default 'home',
  p_club uuid default null,
  p_user uuid default null,
  p_activity uuid default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid, user_id uuid, username text, display_name text, avatar_color text,
  trip_id uuid, to_friends boolean, club_id uuid, club_name text, title text, started_at timestamptz,
  distance_m double precision, moving_s integer, car_label text, car_body text, car_paint text,
  preview jsonb, like_count integer, comment_count integer, liked_by_me boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid),
  friends as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as fid
    from public.friendships f, me
    where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  ),
  my_clubs as (select m.club_id as cid from public.club_members m, me where m.user_id = me.uid)
  select
    a.id, a.user_id, p.username, p.display_name, p.avatar_color,
    -- the full drive behind it is only ever its owner's
    case when a.user_id = me.uid then a.trip_id end,
    a.to_friends,
    case when a.club_id in (select cid from my_clubs) then a.club_id end,
    case when a.club_id in (select cid from my_clubs) then c.name end,
    a.title, a.started_at, a.distance_m, a.moving_s, a.car_label, a.car_body, a.car_paint,
    a.preview, a.like_count, a.comment_count,
    exists (select 1 from public.activity_likes l where l.activity_id = a.id and l.user_id = me.uid),
    a.created_at
  from public.activities a
  cross join me
  join public.profiles p on p.id = a.user_id
  left join public.clubs c on c.id = a.club_id
  where me.uid is not null
    and (
      a.user_id = me.uid
      or (a.to_friends and a.user_id in (select fid from friends))
      or a.club_id in (select cid from my_clubs)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.uid and b.blocked_id = a.user_id) or (b.blocker_id = a.user_id and b.blocked_id = me.uid)
    )
    and case p_scope
      when 'home' then true
      when 'club' then a.club_id = p_club and p_club in (select cid from my_clubs)
      when 'user' then a.user_id = p_user
      when 'one' then a.id = p_activity
      else false
    end
    and (p_before is null or (a.created_at, a.id) < (p_before, p_before_id))
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ─── Driving ─────────────────────────────────────────────────────────────
-- The app says "I'm driving" every couple of minutes while a drive is being recorded or
-- navigated. Like and comment pushes are not sent to someone who is driving; the notice waits in
-- their inbox. Kept out of reach of other users: friends can't read it.
create table private.driving (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  until timestamptz not null
);

create or replace function public.touch_driving()
returns void language sql security definer set search_path = '' as $$
  insert into private.driving (user_id, until)
    select auth.uid(), now() + interval '4 minutes' where auth.uid() is not null
    on conflict (user_id) do update set until = excluded.until;
$$;

create or replace function public.end_driving()
returns void language sql security definer set search_path = '' as $$
  delete from private.driving where user_id = auth.uid();
$$;

-- For the notify function only.
create or replace function public.is_driving(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.driving d where d.user_id = p_user and d.until > now());
$$;

revoke execute on function public.share_trip(uuid, boolean, uuid, text, jsonb) from anon, public;
revoke execute on function public.activity_feed(text, uuid, uuid, uuid, timestamptz, uuid, integer) from anon, public;
revoke execute on function public.activity_comments_page(uuid, timestamptz, uuid, integer) from anon, public;
revoke execute on function public.touch_driving() from anon, public;
revoke execute on function public.end_driving() from anon, public;
revoke execute on function public.is_driving(uuid) from anon, public, authenticated;
grant execute on function public.share_trip(uuid, boolean, uuid, text, jsonb) to authenticated;
grant execute on function public.activity_feed(text, uuid, uuid, uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.activity_comments_page(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.touch_driving() to authenticated;
grant execute on function public.end_driving() to authenticated;
grant execute on function public.is_driving(uuid) to service_role;
