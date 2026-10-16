import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { refreshTracking, requestForegroundPermission } from '@/lib/location';

export type LocationAccess = 'checking' | 'granted' | 'ask' | 'blocked';

async function read(): Promise<LocationAccess> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false ? 'blocked' : 'ask';
  } catch {
    return 'ask';
  }
}

/** Foreground location permission, re-checked whenever the app comes back to the front (e.g. from Settings). */
export function useLocationPermission() {
  const [access, setAccess] = useState<LocationAccess>('checking');

  const refresh = useCallback(async () => {
    const next = await read();
    setAccess(next);
    if (next === 'granted') void refreshTracking();
    return next;
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);

  /** Must run from a tap: browsers may silently ignore location requests that aren't user-initiated. */
  const request = useCallback(async () => {
    await requestForegroundPermission().catch(() => false);
    return refresh();
  }, [refresh]);

  return { access, request };
}
