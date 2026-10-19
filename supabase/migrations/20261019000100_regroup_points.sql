-- Regroup points: the leader picks a spot ahead (usually a gas station) where the convoy gathers.
-- Set and cleared by the drive owner (existing "owner updates drive" policy), read by members.
alter table public.group_drives
  add column if not exists regroup_name text check (regroup_name is null or char_length(regroup_name) between 1 and 80),
  add column if not exists regroup_lat double precision check (regroup_lat is null or regroup_lat between -90 and 90),
  add column if not exists regroup_lng double precision check (regroup_lng is null or regroup_lng between -180 and 180),
  add column if not exists regroup_at timestamptz;
