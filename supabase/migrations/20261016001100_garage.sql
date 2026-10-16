-- 3D garage: more vehicle models and a paint color. Car and hatchback are free;
-- the other models come with the Style Pack. Paint colors are free for everyone.
alter table public.profiles drop constraint if exists profiles_vehicle_check;
alter table public.profiles add constraint profiles_vehicle_check
  check (vehicle in ('car', 'hatch', 'sport', 'classic', 'suv', 'van', 'pickup', 'jeep', 'moto'));

alter table public.profiles
  add column if not exists vehicle_color text not null default 'blue'
  check (vehicle_color in ('blue', 'red', 'orange', 'yellow', 'green', 'purple', 'white', 'silver', 'black'));

create or replace function private.check_vehicle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.vehicle not in ('car', 'hatch')
     and (tg_op = 'INSERT' or new.vehicle is distinct from old.vehicle)
     and not private.has_entitlement(new.id, 'cosmetics') then
    raise exception 'vehicle icon requires the style pack' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
