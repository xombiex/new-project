import { useEffect, useRef, useState } from 'react';

import { fetchRoads, matchRoad, needsRefetch, type Road, type SpeedLimit } from '@/lib/speed-limit';
import type { LngLat } from '@/lib/geo';
import { useTrips } from '@/store/trips';

const RADIUS_M = 600;
const RETRY_MS = 15_000;
/** Keep showing the last limit through brief GPS wobbles (e.g. passing an intersection). */
const HOLD_MS = 8_000;

export type RoadInfo = { limit: SpeedLimit | null; name: string | null };

/** Posted limit and name of the road the driver is on, while `enabled` (a trip or navigation is running). */
export function useSpeedLimit(enabled: boolean): RoadInfo {
  const sample = useTrips((s) => s.lastSample);
  const [info, setInfo] = useState<RoadInfo>({ limit: null, name: null });
  const roads = useRef<Road[]>([]);
  const fetchedAt = useRef<LngLat | null>(null);
  const loading = useRef(false);
  const failedAt = useRef(0);
  const lastMatchAt = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setInfo({ limit: null, name: null });
      return;
    }
    if (!sample) return;
    const pos: LngLat = [sample.lng, sample.lat];

    const road = matchRoad(roads.current, pos, sample.heading);
    if (road) {
      lastMatchAt.current = Date.now();
      setInfo((prev) => (prev.limit === road.limit && prev.name === (road.name ?? null) ? prev : { limit: road.limit, name: road.name ?? null }));
    } else if (Date.now() - lastMatchAt.current > HOLD_MS) {
      setInfo((prev) => (prev.limit || prev.name ? { limit: null, name: null } : prev));
    }

    if (loading.current || Date.now() - failedAt.current < RETRY_MS || !needsRefetch(fetchedAt.current, RADIUS_M, pos)) return;
    loading.current = true;
    const ctrl = new AbortController();
    fetchRoads(pos, RADIUS_M, ctrl.signal)
      .then((r) => {
        roads.current = r;
        fetchedAt.current = pos;
      })
      .catch(() => (failedAt.current = Date.now()))
      .finally(() => (loading.current = false));
  }, [enabled, sample]);

  return info;
}
