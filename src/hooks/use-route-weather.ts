import { useEffect, useRef, useState } from 'react';

import type { NavProgress, NavRoute } from '@/lib/navigation';
import type { Route } from '@/lib/places';
import { cumulativeOf, samplePoints, weatherAlong, type WeatherAlert } from '@/lib/weather';

const REFRESH_MS = 10 * 60_000;

/**
 * Bad weather on the road ahead: for the route you're driving (rechecked every 10 minutes from
 * where you are) or, before you go, for the route option you've picked.
 */
export function useRouteWeather(nav: NavRoute | null, progress: NavProgress | null, planned: Route | undefined): WeatherAlert | null {
  const [alert, setAlert] = useState<WeatherAlert | null>(null);
  const along = useRef(0);
  along.current = progress?.snap.along ?? 0;

  useEffect(() => {
    setAlert(null);
    const ctrl = new AbortController();
    const check = () => {
      let points;
      if (nav) {
        points = samplePoints(nav.geometry, nav.cumulative, nav.totalS, along.current, nav.steps.map((s) => ({ along: s.along, name: s.name })));
      } else if (planned) {
        points = samplePoints(planned.geometry, cumulativeOf(planned.geometry), planned.durationS, 0);
      } else return;
      weatherAlong(points, ctrl.signal).then(
        (a) => !ctrl.signal.aborted && setAlert(a),
        () => {}
      );
    };
    check();
    const id = nav ? setInterval(check, REFRESH_MS) : undefined;
    return () => {
      ctrl.abort();
      if (id) clearInterval(id);
    };
  }, [nav, planned]);

  return alert;
}
