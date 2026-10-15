create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.are_friends(uuid, uuid) set schema private;
alter function public.is_drive_member(uuid, uuid) set schema private;
