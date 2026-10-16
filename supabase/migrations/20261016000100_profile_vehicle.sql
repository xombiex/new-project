alter table public.profiles
  add column vehicle text not null default 'car'
  check (vehicle in ('car', 'sport', 'suv', 'pickup', 'moto', 'jeep'));

-- Anything but the default icon is part of the cosmetics unlock.
create or replace function private.check_vehicle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.vehicle <> 'car'
     and (tg_op = 'INSERT' or new.vehicle is distinct from old.vehicle)
     and not private.has_entitlement(new.id, 'cosmetics') then
    raise exception 'vehicle icon requires the style pack' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger profiles_check_vehicle before insert or update on public.profiles
  for each row execute function private.check_vehicle();
