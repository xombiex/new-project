-- Security tests: what each person can and cannot reach.
--
-- Run the whole file in the SQL editor (or `psql -f`). It makes three throwaway users, acts as
-- each of them the way the app does (the `authenticated` role with their id in the token), and
-- checks what the database lets them do. Nothing is kept: the file always ends by raising, which
-- rolls every change back. The outcome is the message:
--
--     RLS TESTS: 39 passed, 0 failed
--
-- A is the owner of the data. B is A's friend. C is a stranger. D shares a club with A and nothing else.

do $$
declare
  v_admin text := current_user;
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  v_trip uuid := gen_random_uuid();
  v_drive public.group_drives;
  d uuid := gen_random_uuid();
  v_trip2 uuid := gen_random_uuid();
  v_club uuid := gen_random_uuid();
  v_act uuid;
  v_act2 uuid;
  v_comment uuid;
  n int;
  i int;
  passed int := 0;
  failed text[] := '{}';
begin
  -- ── Setup, as the database owner ─────────────────────────────────────
  insert into auth.users (id, email, aud, role, instance_id)
    values (a, 'rls-a@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
           (b, 'rls-b@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
           (c, 'rls-c@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into public.profiles (id, username, display_name)
    values (a, 'rls_test_a', 'A'), (b, 'rls_test_b', 'B'), (c, 'rls_test_c', 'C')
    on conflict (id) do nothing;
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'accepted');
  insert into public.trips (id, user_id, started_at, ended_at, distance_m, moving_s, max_speed_mps)
    values (v_trip, a, now() - interval '1 hour', now(), 12000, 900, 30);
  insert into public.user_locations (user_id, lat, lng, share_until) values (a, 37.77, -122.42, now() + interval '1 hour');
  insert into public.entitlements (user_id, entitlement, source) values (a, 'pro', 'admin');

  -- ── Drives are private ───────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.trips where id = v_trip;
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can read a drive'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.trips where id = v_trip;
  if n = 0 then passed := passed + 1; else failed := failed || 'a friend can read a private drive'; end if;

  update public.trips set name = 'hacked' where id = v_trip;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failed := failed || 'a friend can edit a drive'; end if;

  -- ── Live location: friends only, while shared ────────────────────────
  select count(*) into n from public.user_locations where user_id = a;
  if n = 1 then passed := passed + 1; else failed := failed || 'a friend cannot see a shared location'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.user_locations where user_id = a;
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can see a location'; end if;

  perform set_config('role', v_admin, true);
  update public.user_locations set share_until = now() - interval '1 minute' where user_id = a;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.user_locations where user_id = a;
  if n = 0 then passed := passed + 1; else failed := failed || 'a friend can see a location after sharing ended'; end if;
  perform set_config('role', v_admin, true);
  update public.user_locations set share_until = now() + interval '1 hour' where user_id = a;

  -- ── Purchases can't be granted from the app ──────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.entitlements (user_id, entitlement, source) values (c, 'pro', 'admin');
    failed := failed || 'someone can give themselves Pro';
  exception when others then passed := passed + 1;
  end;
  select count(*) into n from public.entitlements where user_id = a;
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can read purchases'; end if;

  -- ── Admin functions refuse everyone else ─────────────────────────────
  begin
    perform public.admin_stats();
    failed := failed || 'a normal user can call an admin function';
  exception when others then passed := passed + 1;
  end;
  begin
    perform public.admin_set_entitlement(c, 'pro', true, 30);
    failed := failed || 'a normal user can grant Pro through the admin function';
  exception when others then passed := passed + 1;
  end;

  -- ── Friend requests: only the receiver can accept ────────────────────
  insert into public.friendships (requester_id, addressee_id) values (c, a);
  update public.friendships set status = 'accepted' where requester_id = c and addressee_id = a;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failed := failed || 'someone can accept their own friend request'; end if;
  delete from public.friendships where requester_id = c and addressee_id = a;

  -- ── Blocking ─────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.block_user(b);
  select count(*) into n from public.my_blocks();
  if n = 1 then passed := passed + 1; else failed := failed || 'the blocker cannot see their own block list'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.blocks;
  if n = 0 then passed := passed + 1; else failed := failed || 'a blocked person can see the block'; end if;

  delete from public.blocks where blocked_id = b;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failed := failed || 'a blocked person can remove the block'; end if;

  select count(*) into n from public.user_locations where user_id = a;
  if n = 0 then passed := passed + 1; else failed := failed || 'a blocked person can still see the location'; end if;

  begin
    insert into public.friendships (requester_id, addressee_id) values (b, a);
    failed := failed || 'a blocked person can send a new friend request';
  exception when others then passed := passed + 1;
  end;

  -- The block also stops the blocker from asking, until they unblock.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    insert into public.friendships (requester_id, addressee_id) values (a, b);
    failed := failed || 'a request goes through across a block';
  exception when others then passed := passed + 1;
  end;

  -- ── Join codes can't be guessed in bulk ──────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  for i in 1..8 loop
    v_drive := public.join_drive('ZZZZZ' || i);
  end loop;
  begin
    v_drive := public.join_drive('ZZZZZ9');
    failed := failed || 'wrong join codes are never locked out';
  exception when others then passed := passed + 1;
  end;

  -- ── Shared drives, likes and comments ────────────────────────────────
  -- Fresh start: A and B are friends again, D is in a club with A.
  perform set_config('role', v_admin, true);
  delete from public.blocks where blocker_id = a;
  insert into auth.users (id, email, aud, role, instance_id)
    values (d, 'rls-d@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into public.profiles (id, username, display_name) values (d, 'rls_test_d', 'D') on conflict (id) do nothing;
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'accepted');
  insert into public.clubs (id, name, owner_id, invite_code) values (v_club, 'RLS test club', a, 'RLSTEST1');
  insert into public.club_members (club_id, user_id, role) values (v_club, a, 'owner'), (v_club, d, 'member')
    on conflict do nothing;
  insert into public.trips (id, user_id, started_at, ended_at, distance_m, moving_s, max_speed_mps)
    values (v_trip2, a, now() - interval '3 hours', now() - interval '2 hours', 30000, 2400, 31);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.share_trip(v_trip, true, null, 'Stolen', '[]'::jsonb);
    failed := failed || 'someone can share another person''s drive';
  exception when others then passed := passed + 1;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  v_act := (public.share_trip(v_trip, true, null, 'Coast run', '[[[-122.4,37.7],[-122.5,37.8]]]'::jsonb)).id;
  v_act2 := (public.share_trip(v_trip2, false, v_club, 'Club night', '[]'::jsonb)).id;

  -- A friend sees the friends drive but not the club one, and never the drive behind it.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.activities;
  if n = 1 then passed := passed + 1; else failed := failed || format('a friend sees %s shared drives, expected 1', n); end if;
  select count(*) into n from public.activity_feed('home') f where f.trip_id is not null;
  if n = 0 then passed := passed + 1; else failed := failed || 'the feed gives away the id of someone else''s full drive'; end if;
  select count(*) into n from public.trips where id = v_trip;
  if n = 0 then passed := passed + 1; else failed := failed || 'sharing a drive made the full drive readable'; end if;

  -- A club mate sees the club drive but not the friends one.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  select count(*) into n from public.activity_feed('home') f where f.id = v_act2;
  if n = 1 then passed := passed + 1; else failed := failed || 'a club mate cannot see a club drive'; end if;
  select count(*) into n from public.activity_feed('home') f where f.id = v_act;
  if n = 0 then passed := passed + 1; else failed := failed || 'a club mate can see a friends-only drive'; end if;

  -- A stranger sees nothing and can do nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.activities;
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can read shared drives'; end if;
  select count(*) into n from public.activity_feed('user', null, a);
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can list someone''s shared drives'; end if;
  select count(*) into n from public.activity_feed('club', v_club);
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can read a club feed'; end if;
  begin
    insert into public.activity_likes (activity_id) values (v_act);
    failed := failed || 'a stranger can like a drive they cannot see';
  exception when others then passed := passed + 1;
  end;
  begin
    insert into public.activity_comments (activity_id, body) values (v_act, 'hi');
    failed := failed || 'a stranger can comment on a drive they cannot see';
  exception when others then passed := passed + 1;
  end;
  begin
    insert into public.activities (user_id, trip_id, started_at, distance_m, moving_s) values (c, v_trip, now(), 1, 1);
    failed := failed || 'an activity can be written without going through share_trip';
  exception when others then passed := passed + 1;
  end;

  -- A friend can like and comment; the counts follow and the owner gets a notice.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.activity_likes (activity_id) values (v_act);
  insert into public.activity_comments (activity_id, body) values (v_act, '  Nice road  ') returning id into v_comment;
  begin
    update public.activities set like_count = 999 where id = v_act;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n = 0 then passed := passed + 1; else failed := failed || 'a like count can be edited directly'; end if;
  delete from public.activities where id = v_act;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failed := failed || 'a friend can delete someone else''s shared drive'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select like_count * 10 + comment_count into n from public.activities where id = v_act;
  if n = 11 then passed := passed + 1; else failed := failed || format('counts are %s, expected 1 like and 1 comment', n); end if;
  select count(*) into n from public.messages where kind in ('like', 'comment') and activity_id = v_act;
  if n = 2 then passed := passed + 1; else failed := failed || format('the owner got %s notices, expected 2', n); end if;

  -- Reports are write-only for users.
  perform public.report_content('comment', v_comment, 'spam');
  select count(*) into n from public.content_reports;
  if n = 0 then passed := passed + 1; else failed := failed || 'a user can read reports'; end if;
  begin
    perform public.admin_list_content_reports();
    failed := failed || 'a normal user can list reports';
  exception when others then passed := passed + 1;
  end;

  -- "Is driving" is for the server only.
  begin
    perform public.is_driving(b);
    failed := failed || 'a user can ask whether someone is driving';
  exception when others then passed := passed + 1;
  end;

  -- After a block, the drive and the comment disappear from each other's view.
  perform public.block_user(b);
  select count(*) into n from public.activity_comments where activity_id = v_act;
  if n = 0 then passed := passed + 1; else failed := failed || 'comments from a blocked person still show'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.activity_feed('home');
  if n = 0 then passed := passed + 1; else failed := failed || 'a blocked person still sees shared drives'; end if;

  --RLS-TESTS-MORE--

  perform set_config('role', v_admin, true);
  raise exception 'RLS TESTS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then E'\n  - ' || array_to_string(failed, E'\n  - ') else '' end;
end;
$$;
