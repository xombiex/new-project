import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { formatAgo } from '@/lib/time';

/** Seen within this long counts as online (the app checks in every couple of minutes). */
export const ONLINE_MS = 5 * 60_000;
const HEARTBEAT_MS = 2 * 60_000;

export function isOnline(lastSeen: number | undefined, now = Date.now()) {
  return lastSeen != null && now - lastSeen < ONLINE_MS;
}

/** "Online" / "Active 2h ago" / "Offline". */
export function presenceLabel(lastSeen: number | undefined, now = Date.now()): { online: boolean; text: string } {
  if (lastSeen == null) return { online: false, text: 'Offline' };
  if (isOnline(lastSeen, now)) return { online: true, text: 'Online' };
  return { online: false, text: `Active ${formatAgo(lastSeen, now)}` };
}

/**
 * Tell friends we're around: a heartbeat while the app is in front, none in the background.
 * Returns a stop function. With sharing off, any previous status is removed instead.
 */
export function startPresence(share: boolean): () => void {
  if (!share) {
    void supabase.rpc('hide_presence');
    return () => {};
  }
  const touch = () => void supabase.rpc('touch_presence');
  touch();
  let timer: ReturnType<typeof setInterval> | null = setInterval(touch, HEARTBEAT_MS);
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      touch();
      timer ??= setInterval(touch, HEARTBEAT_MS);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  return () => {
    if (timer) clearInterval(timer);
    sub.remove();
  };
}
