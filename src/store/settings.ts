import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  /** Let friends see when I'm in the app */
  shareOnline: boolean;
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

/** First-launch default only; a saved choice always wins (persist restores it over this). */
function regionUnits(): Units {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = /[-_]([A-Z]{2})(?:[-_]|$)/.exec(locale)?.[1];
    return region && !MPH_REGIONS.has(region) ? 'metric' : 'imperial';
  } catch {
    return 'imperial';
  }
}

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
      shareOnline: true,
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
