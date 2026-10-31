-- Style drops: one-time add-ons for the 3D cars, sold separately from Pro and Clubs.
alter table public.entitlements drop constraint if exists entitlements_entitlement_check;
alter table public.entitlements add constraint entitlements_entitlement_check
  check (entitlement in ('pro', 'cosmetics', 'club', 'drop_afterburner', 'drop_neon_trails'));

-- On the profile so everyone in a convoy sees them.
alter table public.profiles
  add column flame_style text check (flame_style in ('inferno', 'plasma', 'toxic', 'violet', 'rainbow')),
  add column trail_style text check (trail_style in ('cyan', 'magenta', 'lime', 'gold'));

create or replace function private.check_drop_styles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.flame_style is not null
     and (tg_op = 'INSERT' or new.flame_style is distinct from old.flame_style)
     and not private.has_entitlement(new.id, 'drop_afterburner') then
    raise exception 'that flame is part of a style drop' using errcode = 'P0001';
  end if;
  if new.trail_style is not null
     and (tg_op = 'INSERT' or new.trail_style is distinct from old.trail_style)
     and not private.has_entitlement(new.id, 'drop_neon_trails') then
    raise exception 'that trail is part of a style drop' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger profiles_check_drop_styles before insert or update on public.profiles
  for each row execute function private.check_drop_styles();
