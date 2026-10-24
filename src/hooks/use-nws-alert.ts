import { useEffect, useState } from 'react';

import { alertAt, worse, type NwsAlert } from '@/lib/nws-alerts';

const REFRESH_MS = 10 * 60_000;

/**
 * The most serious National Weather Service alert where you are or, while navigating, at your
 * destination. Rechecked every 10 minutes and when you move ~10 km (coordinates are rounded).
 */
export function useNwsAlert(here: [number, number] | null, destination: [number, number] | null): NwsAlert | null {
  const [alert, setAlert] = useState<NwsAlert | null>(null);
  const round = (c: [number, number] | null) => (c ? `${c[0].toFixed(1)},${c[1].toFixed(1)}` : '');
  const hereKey = round(here);
  const destKey = round(destination);

  useEffect(() => {
    if (!hereKey && !destKey) {
      setAlert(null);
      return;
    }
    const ctrl = new AbortController();
    const parse = (key: string) => key.split(',').map(Number) as [number, number];
    const check = () => {
      Promise.all([
        hereKey ? alertAt(parse(hereKey), 'here', ctrl.signal).catch(() => null) : null,
        destKey && destKey !== hereKey ? alertAt(parse(destKey), 'destination', ctrl.signal).catch(() => null) : null,
      ]).then(([a, b]) => !ctrl.signal.aborted && setAlert(worse(a, b)));
    };
    check();
    const id = setInterval(check, REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [hereKey, destKey]);

  return alert;
}
