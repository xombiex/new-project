-- Vehicles from Kenney's Car Kit (CC0). As before, only the sedan and hatchback are free
-- (check_vehicle and check_car enforce that, so they need no change).
alter table public.profiles drop constraint profiles_vehicle_check;
alter table public.profiles add constraint profiles_vehicle_check check (vehicle in ('car', 'hatch', 'sport', 'tuner', 'muscle', 'super', 'rally', 'classic', 'hotrod', 'wagon', 'suv', 'luxury', 'van', 'pickup', 'jeep', 'buggy', 'truck', 'flatbed', 'bus', 'moto', 'taxi', 'police', 'ambulance', 'firetruck', 'garbage', 'formula', 'future', 'kart', 'tractor'));
alter table public.cars drop constraint cars_body_check;
alter table public.cars add constraint cars_body_check check (body in ('car', 'hatch', 'sport', 'tuner', 'muscle', 'super', 'rally', 'classic', 'hotrod', 'wagon', 'suv', 'luxury', 'van', 'pickup', 'jeep', 'buggy', 'truck', 'flatbed', 'bus', 'moto', 'taxi', 'police', 'ambulance', 'firetruck', 'garbage', 'formula', 'future', 'kart', 'tractor'));
