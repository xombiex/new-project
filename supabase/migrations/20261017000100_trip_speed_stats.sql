-- Trip detail overhaul: speed-colored routes, speed distribution, the car it was driven in, role.
alter table public.trips
  add column if not exists speeds jsonb,
  add column if not exists speed_hist jsonb,
  add column if not exists car_label text check (char_length(car_label) <= 100),
  add column if not exists car_body text,
  add column if not exists car_paint text,
  add column if not exists role text not null default 'driver' check (role in ('driver', 'passenger'));
