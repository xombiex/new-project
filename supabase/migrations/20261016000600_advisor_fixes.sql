alter function private.report_ttl(text) set search_path = '';
alter function private.dist_m(double precision, double precision, double precision, double precision) set search_path = '';
alter function private.random_code(int) set search_path = '';

-- pg_net isn't relocatable; recreate it in the extensions schema (its functions live in `net` either way).
drop extension if exists pg_net;
create extension pg_net schema extensions;

create index club_events_created_by_idx on public.club_events(created_by);
create index club_events_drive_idx on public.club_events(drive_id);
create index group_drives_club_idx on public.group_drives(club_id);
