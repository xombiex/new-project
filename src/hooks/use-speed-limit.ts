import { useEffect, useRef, useState } from 'react';

import { fetchRoads, matchRoad, needsRefetch, type Road, type SpeedLimit } from '@/lib/speed-limit';
import type { LngLat } from '@/lib/geo';
import { useTrips } from '@/store/trips';

const RADIUS_M = 600;
const RETRY_MS = 15_000;
/** Keep showing the last limit through brief GPS wobbles (e.g. passing an intersection). */
const HOLD_MS = 8_000;

/** Posted limit for the road the driver is on, while `enabled` (a trip or navigation is running). */
export function useSpeedLimit(enabled: boolean): SpeedLimit | null {
  const sample = useTrips((s) => s.lastSample);
  const [limit, setLimit] = useState<SpeedLimit | null>(null);
  const roads = useRef<Road[]>([]);
  const fetchedAt = useRef<LngLat | null>(null);
  const loading = useRef(false);
  const failedAt = useRef(0);
  const lastMatchAt = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLimit(null);
      return;
    }
    if (!sample) return;
    const pos: LngLat = [sample.lng, sample.lat];

    const road = matchRoad(roads.current, pos, sample.heading);
    if (road) {
      lastMatchAt.current = Date.now();
      setLimit(road.limit);
    } else if (Date.now() - lastMatchAt.current > HOLD_MS) {
      setLimit(null);
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

  return limit;
}
