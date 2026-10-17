-- Multi-car garage and friends' online status.

-- ─── Garage ──────────────────────────────────────────────────────────────────
-- Real cars people own or want ("2024 Porsche 911 GT3 RS"), each drawn with one of the app's 3D
-- bodies and paints. The one marked on the profile (primary_car_id) is what friends see on the map.
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  make text not null check (char_length(btrim(make)) between 1 and 40),
  model text not null check (char_length(btrim(model)) between 1 and 40),
  year int check (year between 1886 and 2100),
  nickname text check (char_length(nickname) <= 40),
  body text not null default 'car' check (body in ('car', 'hatch', 'sport', 'classic', 'suv', 'van', 'pickup', 'jeep', 'moto')),
  paint text not null default 'blue' check (paint in ('blue', 'red', 'orange', 'yellow', 'green', 'purple', 'white', 'silver', 'black')),
  created_at timestamptz not null default now()
);
create index cars_user_idx on public.cars(user_id, created_at);
alter table public.cars enable row level security;

-- Friends can browse each other's garages (like Wheelz); only the owner can change theirs.
create policy "cars readable by owner and friends" on public.cars for select to authenticated
  using (user_id = (select auth.uid()) or private.are_friends(user_id, (select auth.uid())));
create policy "insert own cars" on public.cars for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own cars" on public.cars for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own cars" on public.cars for delete to authenticated
  using (user_id = (select auth.uid()));

-- Free: 3 cars and the free bodies. Pro: unlimited cars. Style Pack: every body.
create or replace function private.check_car()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     and not private.has_entitlement(new.user_id, 'pro')
     and (select count(*) from public.cars where user_id = new.user_id) >= 3 then
    raise exception 'garage full: free accounts hold 3 cars' using errcode = 'P0001';
  end if;
  if new.body not in ('car', 'hatch')
     and (tg_op = 'INSERT' or new.body is distinct from old.body)
     and not private.has_entitlement(new.user_id, 'cosmetics') then
    raise exception 'vehicle icon requires the style pack' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger cars_check before insert or update on public.cars
  for each row execute function private.check_car();

alter table public.profiles add column if not exists primary_car_id uuid references public.cars(id) on delete set null;

-- ─── Online status ──────────────────────────────────────────────────────────
-- A heartbeat while the app is open. Kept out of profiles (readable by every signed-in user)
-- so only friends can see when you were last around.
create table public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.presence enable row level security;
create policy "presence readable by self and friends" on public.presence for select to authenticated
  using (user_id = (select auth.uid()) or private.are_friends(user_id, (select auth.uid())));

-- Server clock, so a wrong phone clock can't fake being online.
create or replace function public.touch_presence()
returns void language sql security definer set search_path = '' as $$
  insert into public.presence (user_id, last_seen_at) values ((select auth.uid()), now())
  on conflict (user_id) do update set last_seen_at = now();
$$;

-- "Show when I'm online" turned off.
create or replace function public.hide_presence()
returns void language sql security definer set search_path = '' as $$
  delete from public.presence where user_id = (select auth.uid());
$$;

revoke all on function public.touch_presence() from public, anon;
revoke all on function public.hide_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.hide_presence() to authenticated;
