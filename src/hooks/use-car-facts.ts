import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { combineFacts, makeSlug, matchPower, type CarFacts, type Engine, type PowerRow } from '@/lib/car-power';
import { SITE_URL } from '@/lib/site';

/** One small file per make, fetched once. A make that isn't on the EPA's list is just empty. */
const makes = new Map<string, Promise<PowerRow[]>>();

function rowsFor(make: string): Promise<PowerRow[]> {
  const slug = makeSlug(make);
  if (!slug) return Promise.resolve([]);
  if (!makes.has(slug)) {
    const base = Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : SITE_URL;
    const job = fetch(`${base}/specs/${slug}.json`)
      .then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as PowerRow[]) : []))
      .catch(() => {
        makes.delete(slug); // offline: try again next time
        return [] as PowerRow[];
      });
    makes.set(slug, job);
  }
  return makes.get(slug)!;
}

export async function carFacts(make: string, model: string, year: number | null, engine?: Engine): Promise<CarFacts> {
  const rows = await rowsFor(make);
  return combineFacts(matchPower(rows, model, year, engine), make, model, year, engine);
}

/** Known numbers for a car, for showing on a card when none are saved. */
export function useCarFacts(make: string, model: string, year: number | null, engine?: Engine, enabled = true): CarFacts | null {
  const [facts, setFacts] = useState<CarFacts | null>(null);
  const displ = engine?.displ;
  const cyl = engine?.cyl;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void carFacts(make, model, year, { displ, cyl }).then((f) => live && setFacts(f));
    return () => {
      live = false;
    };
  }, [make, model, year, displ, cyl, enabled]);
  return facts;
}
