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
  keepScreenOn: boolean;
  appearance: Appearance;
  glow: GlowPreset;
  mapTheme: MapTheme;
  /** kept on this device only */
  privacyZones: PrivacyZone[];
  /** spoken warnings for road reports ahead */
  reportAlerts: boolean;
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

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      units: 'imperial',
      keepScreenOn: true,
      appearance: 'system',
      glow: 'ember',
      mapTheme: 'auto',
      privacyZones: [],
      reportAlerts: true,
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
