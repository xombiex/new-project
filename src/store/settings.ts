import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LATEST_RELEASE } from '@/lib/changelog';
import type { Units } from '@/lib/geo';
import type { GlowPreset } from '@/lib/glow';
import type { MapTheme } from '@/lib/map-style';
import type { PrivacyZone } from '@/lib/privacy';

export type Appearance = 'system' | 'light' | 'dark';

type SettingsState = {
  units: Units;
  /** Last known position, so maps open where you are instead of zoomed out on the world */
  lastCoord: [number, number] | null;
  setLastCoord: (c: [number, number]) => void;
  keepScreenOn: boolean;
  appearance: Appearance;
  glow: GlowPreset;
  mapTheme: MapTheme;
  /** kept on this device only */
  privacyZones: PrivacyZone[];
  /** spoken warnings for road reports ahead */
  reportAlerts: boolean;
  /** Seen the welcome screens */
  onboarded: boolean;
  /** Hill shading (and 3D mountains with the 3D map) */
  terrain: boolean;
  setTerrain: (on: boolean) => void;
  /** NOAA weather radar over the map */
  radar: boolean;
  setRadar: (on: boolean) => void;
  /** Newest "What's new" release seen (null: never) */
  seenRelease: string | null;
  setSeenRelease: (id: string) => void;
  setOnboarded: (on: boolean) => void;
  /** Let friends see when I'm in the app */
  shareOnline: boolean;
  /** Speed cameras on the map + heads-up when approaching one */
  speedCameraAlerts: boolean;
  setSpeedCameraAlerts: (on: boolean) => void;
  /** License-plate (Flock/ALPR) cameras on the map + heads-up */
  showAlprCameras: boolean;
  setShowAlprCameras: (on: boolean) => void;
  /** Prefer routes that pass the fewest license-plate cameras */
  avoidAlprCameras: boolean;
  setAvoidAlprCameras: (on: boolean) => void;
  /** Tilted 3D view with raised buildings when zoomed in */
  map3d: boolean;
  setMap3d: (on: boolean) => void;
  setShareOnline: (on: boolean) => void;
  /** start/stop recording automatically when driving is detected */
  autoDetect: boolean;
  setUnits: (units: Units) => void;
  setKeepScreenOn: (on: boolean) => void;
  setAppearance: (appearance: Appearance) => void;
  setGlow: (glow: GlowPreset) => void;
  setMapTheme: (mapTheme: MapTheme) => void;
  addPrivacyZone: (zone: PrivacyZone) => void;
  removePrivacyZone: (id: string) => void;
  setReportAlerts: (on: boolean) => void;
  setAutoDetect: (on: boolean) => void;
};

/** Countries that post speeds in mph (US and territories, UK, a few others). Everyone else: km/h. */
const MPH_REGIONS = new Set(['US', 'GB', 'LR', 'PR', 'VI', 'GU', 'AS', 'MP', 'UM', 'BS', 'BZ', 'KY', 'VG', 'AG', 'DM', 'GD', 'KN', 'LC', 'VC', 'MS', 'AI', 'TC', 'FK', 'SH', 'IM', 'JE', 'GG']);

/** The phone's region (e.g. "US"), or null when the locale doesn't say. */
function deviceRegion(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return /[-_]([A-Z]{2})(?:[-_]|$)/.exec(locale)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** First-launch default only; a saved choice always wins (persist restores it over this). */
function regionUnits(): Units {
  const region = deviceRegion();
  return region && !MPH_REGIONS.has(region) ? 'metric' : 'imperial';
}

/**
 * Speed camera warnings are illegal to use while driving in a few countries (e.g. Germany and
 * Switzerland), so they start off there. People can still turn them on; the Terms cover it.
 */
const CAMERA_ALERTS_OFF = new Set(['DE', 'CH', 'AT']);

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      units: regionUnits(),
      lastCoord: null,
      setLastCoord: (lastCoord) => set({ lastCoord }),
      keepScreenOn: true,
      appearance: 'system',
      glow: 'ember',
      mapTheme: 'auto',
      privacyZones: [],
      reportAlerts: true,
      onboarded: false,
      // New people just had the tour: today's "What's new" would only repeat it.
      setOnboarded: (onboarded) => set(onboarded ? { onboarded, seenRelease: LATEST_RELEASE?.id ?? null } : { onboarded }),
      seenRelease: null,
      setSeenRelease: (seenRelease) => set({ seenRelease }),
      shareOnline: true,
      speedCameraAlerts: !CAMERA_ALERTS_OFF.has(deviceRegion() ?? ''),
      setSpeedCameraAlerts: (speedCameraAlerts) => set({ speedCameraAlerts }),
      showAlprCameras: true,
      setShowAlprCameras: (showAlprCameras) => set({ showAlprCameras }),
      avoidAlprCameras: false,
      setAvoidAlprCameras: (avoidAlprCameras) => set({ avoidAlprCameras }),
      map3d: true,
      setMap3d: (map3d) => set({ map3d }),
      terrain: true,
      setTerrain: (terrain) => set({ terrain }),
      radar: false,
      setRadar: (radar) => set({ radar }),
      setShareOnline: (shareOnline) => set({ shareOnline }),
      autoDetect: false,
      setUnits: (units) => set({ units }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
      setAppearance: (appearance) => set({ appearance }),
      setGlow: (glow) => set({ glow }),
      setMapTheme: (mapTheme) => set({ mapTheme }),
      addPrivacyZone: (zone) => set({ privacyZones: [...get().privacyZones, zone] }),
      removePrivacyZone: (id) => set({ privacyZones: get().privacyZones.filter((z) => z.id !== id) }),
      setReportAlerts: (reportAlerts) => set({ reportAlerts }),
      setAutoDetect: (autoDetect) => set({ autoDetect }),
    }),
    { name: 'convoy-settings', storage: createJSONStorage(() => AsyncStorage) }
  )
);
