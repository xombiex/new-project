import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { CAMERA_LABEL, cameraAhead, fetchCamerasAround, type Camera, type CameraKind } from '@/lib/cameras';
import { haversine, type LngLat } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { spokenDistance } from '@/lib/instructions';
import { onLocation } from '@/lib/location';
import { useNavigation } from '@/store/navigation';
import { useSettings } from '@/store/settings';

/** Load cameras this far around you; reload once you've moved half of it. */
const RADIUS_M = 8000;
const RETRY_MS = 30_000;
const MAX_CAMERAS = 5000;

type CamerasState = {
  cameras: Camera[];
  /** the camera you're approaching right now, for the Drive screen banner */
  ahead: { camera: Camera; distanceM: number } | null;
  refresh: (me: LngLat) => Promise<void>;
};

let fetchedAt: LngLat | null = null;
let loading = false;
let failedAt = 0;
const warned = new Set<number>();

export const useCameras = create<CamerasState>()((set, get) => ({
  cameras: [],
  ahead: null,

  refresh: async (me) => {
    if (loading || Date.now() - failedAt < RETRY_MS) return;
    if (fetchedAt && haversine(fetchedAt, me) < RADIUS_M / 2) return;
    loading = true;
    try {
      const fresh = await fetchCamerasAround(me, RADIUS_M);
      // Merge with what we already have (driving across areas), newest area wins, capped.
      const byId = new Map(get().cameras.map((c) => [c.id, c]));
      for (const c of fresh) byId.set(c.id, c);
      set({ cameras: [...byId.values()].slice(-MAX_CAMERAS) });
      fetchedAt = me;
    } catch {
      failedAt = Date.now();
    } finally {
      loading = false;
    }
  },
}));

/** Which kinds the user wants on the map and alerted. */
export function cameraKinds(): CameraKind[] {
  const { speedCameraAlerts, showAlprCameras } = useSettings.getState();
  return [...(speedCameraAlerts ? (['speed', 'redlight'] as const) : []), ...(showAlprCameras ? (['alpr'] as const) : [])];
}

// Load cameras around you, and give one heads-up per camera on the road ahead.
onLocation((samples) => {
  const s = samples[samples.length - 1];
  if (!s) return;
  const me: LngLat = [s.lng, s.lat];
  const kinds = cameraKinds();
  if (kinds.length === 0) {
    if (useCameras.getState().ahead) useCameras.setState({ ahead: null });
    return;
  }
  void useCameras.getState().refresh(me);

  const speed = s.speed != null && s.speed >= 0 ? s.speed : 0;
  const ahead = cameraAhead(useCameras.getState().cameras, me, s.heading, speed, kinds);
  const prev = useCameras.getState().ahead;
  if (ahead?.camera.id !== prev?.camera.id || (ahead && prev && Math.abs(ahead.distanceM - prev.distanceM) > 25)) {
    useCameras.setState({ ahead });
  }
  if (!ahead || warned.has(ahead.camera.id)) return;
  warned.add(ahead.camera.id);
  haptic.warning();
  const { reportAlerts, units } = useSettings.getState();
  if (!reportAlerts || useNavigation.getState().muted) return;
  const what = CAMERA_LABEL[ahead.camera.kind];
  Speech.speak(`${what} ahead, in ${spokenDistance(units, ahead.distanceM)}.`, { language: 'en-US' });
});
