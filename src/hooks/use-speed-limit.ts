import { useEffect, useRef, useState } from 'react';

import { isDemo } from '@/lib/demo';
import { haversine, type LngLat } from '@/lib/geo';
import { fetchRoads, matchRoad, roadsCell, traceRoad, type Road, type SpeedLimit } from '@/lib/speed-limit';
import { useTrips } from '@/store/trips';

const RETRY_MS = 15_000;
/** Keep showing the last limit through brief GPS wobbles (e.g. passing an intersection). */
const HOLD_MS = 8_000;
/** Track points for road matching: one every 20 m, the last few. */
const TRACK_SPACING_M = 20;
const TRACK_POINTS = 6;
/** Ask again after moving this far, but at most this often. */
const REQUERY_M = 40;
const MIN_QUERY_GAP_MS = 4_000;
/** Ignore fixes this vague; they snap to the wrong street. */
const MAX_ACCURACY_M = 40;
/** How many 1 km cells of fallback road data to keep. */
const MAX_CELLS = 12;

export type RoadInfo = { limit: SpeedLimit | null; name: string | null };

/**
 * Posted limit and name of the road the driver is on, while `enabled` (a trip or navigation is
 * running). Main source: your last few positions snapped to the road by Valhalla (fast, always
 * up). Backup: OpenStreetMap roads around you, matched locally.
 */
export function useSpeedLimit(enabled: boolean): RoadInfo {
  const sample = useTrips((s) => s.lastSample);
  const [info, setInfo] = useState<RoadInfo>({ limit: null, name: null });
  const track = useRef<LngLat[]>([]);
  const lastQuery = useRef<{ at: LngLat; time: number } | null>(null);
  const querying = useRef(false);
  const traceFailedAt = useRef(0);
  const lastGoodAt = useRef(0);
  // Backup data
  const roads = useRef<Map<string, Road[]>>(new Map());
  const loadingCell = useRef(false);
  const cellFailedAt = useRef(0);

  useEffect(() => {
    if (isDemo()) return; // fixed road below
    if (!enabled) {
      setInfo({ limit: null, name: null });
      track.current = [];
      return;
    }
    if (!sample || (sample.accuracy != null && sample.accuracy > MAX_ACCURACY_M)) return;
    const pos: LngLat = [sample.lng, sample.lat];

    const prev = track.current.at(-1);
    if (!prev || haversine(prev, pos) >= TRACK_SPACING_M) track.current = [...track.current, pos].slice(-TRACK_POINTS);

    const show = (limit: SpeedLimit | null, name: string | null) => {
      lastGoodAt.current = Date.now();
      setInfo((p) => (p.name === name && p.limit?.value === limit?.value && p.limit?.unit === limit?.unit && p.limit?.estimated === limit?.estimated ? p : { limit, name }));
    };

    // Backup: local match against downloaded roads (instant when we have them).
    const fallBack = () => {
      const road = matchRoad([...roads.current.values()].flat(), pos, sample.heading);
      if (road) show(road.limit, road.name ?? null);
      else if (Date.now() - lastGoodAt.current > HOLD_MS) setInfo((p) => (p.limit || p.name ? { limit: null, name: null } : p));
      const cell = roadsCell(pos);
      if (loadingCell.current || roads.current.has(cell) || Date.now() - cellFailedAt.current < RETRY_MS) return;
      loadingCell.current = true;
      fetchRoads(pos, 0)
        .then((r) => {
          roads.current.set(cell, r);
          while (roads.current.size > MAX_CELLS) roads.current.delete(roads.current.keys().next().value!);
        })
        .catch(() => (cellFailedAt.current = Date.now()))
        .finally(() => (loadingCell.current = false));
    };

    const traceDown = Date.now() - traceFailedAt.current < RETRY_MS;
    if (traceDown) {
      fallBack();
      return;
    }
    const q = lastQuery.current;
    const due = !q || (haversine(q.at, pos) >= REQUERY_M && Date.now() - q.time >= MIN_QUERY_GAP_MS);
    if (querying.current || !due || track.current.length < 2) {
      if (Date.now() - lastGoodAt.current > HOLD_MS && !querying.current && track.current.length < 2) fallBack();
      return;
    }
    querying.current = true;
    lastQuery.current = { at: pos, time: Date.now() };
    traceRoad(track.current)
      .then((road) => {
        if (road) show(road.limit, road.name);
        else if (Date.now() - lastGoodAt.current > HOLD_MS) fallBack();
      })
      .catch(() => {
        traceFailedAt.current = Date.now();
        fallBack();
      })
      .finally(() => (querying.current = false));
  }, [enabled, sample]);

  // Screenshot demo: a fixed road, no network.
  if (isDemo()) return enabled ? { limit: { value: 35, unit: 'mph' }, name: 'North Florida Avenue' } : { limit: null, name: null };
  return info;
}
