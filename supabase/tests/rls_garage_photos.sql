-- Security tests, part two: service log, drive photos, saved drives, weekly recap.
-- Same idea as rls.sql: run the whole file; it always ends by raising, which rolls everything
-- back. Expect: RLS TESTS 2: 9 passed, 0 failed
-- A owns a car and a shared drive. B is a stranger. Neither has Pro.

do $$
declare
  v_admin text := current_user;
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  v_car uuid := gen_random_uuid();
  v_trip uuid := gen_random_uuid();
  v_act uuid;
  n int;
  passed int := 0;
  failed text[] := '{}';
begin
  insert into auth.users (id, email, aud, role, instance_id)
    values (a, 'rls2-a@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
           (b, 'rls2-b@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into public.profiles (id, username, display_name) values (a, 'rls2_test_a', 'A'), (b, 'rls2_test_b', 'B') on conflict (id) do nothing;
  insert into public.cars (id, user_id, make, model) values (v_car, a, 'Mazda', 'Miata');
  insert into public.trips (id, user_id, started_at, ended_at, distance_m, moving_s, max_speed_mps) values (v_trip, a, now() - interval '1 hour', now(), 12000, 900, 30);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.car_maintenance (car_id, kind) values (v_car, 'oil');
  insert into public.car_fuel (car_id, litres) values (v_car, 40);
  v_act := (public.share_trip(v_trip, true, null, 'Test', '[]'::jsonb)).id;
  begin
    perform public.set_activity_photo(v_act, a::text || '/x.jpg');
    failed := failed || 'a photo can be attached without Pro';
  exception when others then passed := passed + 1;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('activity-photos', a::text || '/x.jpg', a);
    failed := failed || 'a photo can be uploaded without Pro';
  exception when others then passed := passed + 1;
  end;
  begin
    perform public.weekly_recaps();
    failed := failed || 'a user can read everyone''s weekly totals';
  exception when others then passed := passed + 1;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select (select count(*) from public.car_maintenance) + (select count(*) from public.car_fuel) into n;
  if n = 0 then passed := passed + 1; else failed := failed || 'a stranger can read a service log'; end if;
  begin
    insert into public.car_maintenance (car_id, kind) values (v_car, 'tires');
    failed := failed || 'someone can write to another person''s service log';
  exception when others then passed := passed + 1;
  end;
  begin
    insert into public.car_fuel (car_id, litres) values (v_car, 10);
    failed := failed || 'someone can write to another person''s fuel log';
  exception when others then passed := passed + 1;
  end;
  begin
    insert into public.saved_routes (activity_id) values (v_act);
    failed := failed || 'a drive can be saved by someone who cannot see it';
  exception when others then passed := passed + 1;
  end;
  begin
    perform public.set_activity_photo(v_act, b::text || '/x.jpg');
    failed := failed || 'someone can change the photo on another person''s drive';
  exception when others then passed := passed + 1;
  end;
  select count(*) into n from public.activity_feed('saved');
  if n = 0 then passed := passed + 1; else failed := failed || 'the saved list shows drives that were never saved'; end if;

  perform set_config('role', v_admin, true);
  raise exception 'RLS TESTS 2: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then E'\n  - ' || array_to_string(failed, E'\n  - ') else '' end;
end;
$$;
