import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { findCarPhoto, type CarPhoto } from '@/lib/car-photos';

/** Keep what we found for a month; a car with no photo gets another look after a week. */
const KEEP_MS = 30 * 86_400_000;
const KEEP_NONE_MS = 7 * 86_400_000;

type Cached = { at: number; photo: CarPhoto | null };

/** Same car on two cards (or on the way back to the tab): one lookup. */
const pending = new Map<string, Promise<CarPhoto | null>>();

async function lookup(make: string, model: string, year: number | null): Promise<CarPhoto | null> {
  const key = `car-photo:${make}|${model}|${year ?? ''}`.toLowerCase();
  const saved = await AsyncStorage.getItem(key).catch(() => null);
  if (saved) {
    const c = JSON.parse(saved) as Cached;
    if (Date.now() - c.at < (c.photo ? KEEP_MS : KEEP_NONE_MS)) return c.photo;
  }
  const photo = await findCarPhoto(make, model, year);
  void AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), photo } satisfies Cached)).catch(() => {});
  return photo;
}

/** A real photo of this make and model, for the garage. Null until found, or if there isn't one. */
export function useCarPhoto(make: string, model: string, year: number | null): CarPhoto | null {
  const [photo, setPhoto] = useState<CarPhoto | null>(null);
  useEffect(() => {
    let live = true;
    setPhoto(null);
    const key = `${make}|${model}|${year ?? ''}`;
    let job = pending.get(key);
    if (!job) {
      job = lookup(make, model, year).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    job.then(
      (p) => live && setPhoto(p),
      () => {} // offline: the card keeps its low-poly car
    );
    return () => {
      live = false;
    };
  }, [make, model, year]);
  return photo;
}
