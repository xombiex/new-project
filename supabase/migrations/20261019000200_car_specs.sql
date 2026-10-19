-- Garage cars remember their trim and specs (horsepower, 0-60, drivetrain, transmission, MPG...),
-- looked up from the EPA's vehicle database / a VIN, or entered by the owner for modded cars.
alter table public.cars
  add column if not exists trim text check (trim is null or char_length(trim) <= 80),
  add column if not exists specs jsonb check (specs is null or (jsonb_typeof(specs) = 'object' and octet_length(specs::text) <= 4000));
