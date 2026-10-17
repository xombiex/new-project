/**
 * Module-scope wiring that must exist even when the OS launches the app headlessly
 * to deliver background locations (no screens are mounted in that case).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { initialDetector, step } from '@/lib/auto-trip';
import { formatDistance } from '@/lib/geo';
import { addReason, onLocation, removeReason } from '@/lib/location';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

onLocation((samples) => useTrips.getState().ingest(samples));

// Remember roughly where we are (rounded, throttled) so maps open there next launch.
let lastSaved = 0;
onLocation((samples) => {
  const s = samples[samples.length - 1];
  if (!s || Date.now() - lastSaved < 60_000) return;
  lastSaved = Date.now();
  useSettings.getState().setLastCoord([Math.round(s.lng * 1e4) / 1e4, Math.round(s.lat * 1e4) / 1e4]);
});

// A trip in progress survives restarts; resume GPS for it once persisted state loads.
const resumeTrip = () => {
  if (useTrips.getState().active) void addReason('trip');
};
if (useTrips.persist.hasHydrated()) resumeTrip();
else useTrips.persist.onFinishHydration(resumeTrip);

// ─── Automatic drive detection ────────────────────────────────────────────

let detector = initialDetector;

function localNotice(title: string, body: string) {
  if (Platform.OS === 'web') return;
  void Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(() => {});
}

onLocation((samples) => {
  if (!useSettings.getState().autoDetect) return;
  for (const s of samples) {
    const { state, event } = step(detector, s);
    detector = state;
    const trips = useTrips.getState();
    if (event === 'start' && !trips.active) {
      trips.start(true);
      void addReason('trip');
      localNotice('Recording your drive', 'Convoy noticed you started driving. It will stop on its own when you park.');
    } else if (event === 'stop' && trips.active && trips.activeAuto) {
      void removeReason('trip');
      const trip = trips.finish();
      if (trip) localNotice('Drive saved', `${formatDistance(useSettings.getState().units, trip.distanceM)} added to your drives.`);
    }
  }
});

/** Keep the low-power watcher running exactly while the setting is on. */
function syncAutoDetect() {
  if (useSettings.getState().autoDetect) void addReason('auto');
  else {
    detector = initialDetector;
    void removeReason('auto');
  }
}
if (useSettings.persist.hasHydrated()) syncAutoDetect();
else useSettings.persist.onFinishHydration(syncAutoDetect);
useSettings.subscribe((s, prev) => {
  if (s.autoDetect !== prev.autoDetect) syncAutoDetect();
});
