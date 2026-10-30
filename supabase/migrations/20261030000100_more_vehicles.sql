-- Nine more low-poly vehicles. Everything but the sedan and hatchback stays behind the Style Pack
-- (check_vehicle and check_car only allow those two for free, so they need no change).
alter table public.profiles drop constraint profiles_vehicle_check;
alter table public.profiles add constraint profiles_vehicle_check check (vehicle in ('car', 'hatch', 'sport', 'tuner', 'muscle', 'super', 'rally', 'classic', 'hotrod', 'wagon', 'suv', 'van', 'pickup', 'jeep', 'buggy', 'truck', 'bus', 'moto'));
alter table public.cars drop constraint cars_body_check;
alter table public.cars add constraint cars_body_check check (body in ('car', 'hatch', 'sport', 'tuner', 'muscle', 'super', 'rally', 'classic', 'hotrod', 'wagon', 'suv', 'van', 'pickup', 'jeep', 'buggy', 'truck', 'bus', 'moto'));
