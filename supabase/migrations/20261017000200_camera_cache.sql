-- Shared cache of OpenStreetMap road cameras, filled on demand by the `cameras` edge function in
-- 1°×1° cells, so only the first driver in an area waits for Overpass; everyone else is instant.
create table public.road_cameras (
  osm_id bigint primary key,
  kind text not null check (kind in ('speed', 'alpr')),
  lat double precision not null,
  lng double precision not null,
  maxspeed text,
  operator text,
  direction real,
  cell text not null,
  updated_at timestamptz not null default now()
);
create index road_cameras_cell_idx on public.road_cameras(cell);

create table public.camera_cells (
  cell text primary key,
  fetched_at timestamptz not null default now(),
  camera_count int not null default 0
);

-- Public map data (ODbL); readable by anyone, written only by the edge function (service role).
alter table public.road_cameras enable row level security;
alter table public.camera_cells enable row level security;
create policy "cameras are public" on public.road_cameras for select to anon, authenticated using (true);
create policy "camera cells are public" on public.camera_cells for select to anon, authenticated using (true);
