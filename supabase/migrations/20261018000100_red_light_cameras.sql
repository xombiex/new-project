-- Red light cameras join speed cameras and plate readers in the shared camera cache.
alter table public.road_cameras drop constraint if exists road_cameras_kind_check;
alter table public.road_cameras add constraint road_cameras_kind_check check (kind in ('speed', 'redlight', 'alpr'));

-- Cached areas were fetched without red light cameras: mark them stale so the next driver refreshes them.
update public.camera_cells set fetched_at = '2000-01-01';
