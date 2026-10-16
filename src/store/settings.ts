import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Units } from '@/lib/geo';
import type { GlowPreset } from '@/lib/glow';
import type { MapTheme } from '@/lib/map-style';

export type Appearance = 'system' | 'light' | 'dark';

type SettingsState = {
  units: Units;
  keepScreenOn: boolean;
  appearance: Appearance;
  glow: GlowPreset;
  mapTheme: MapTheme;
  setUnits: (units: Units) => void;
  setKeepScreenOn: (on: boolean) => void;
  setAppearance: (appearance: Appearance) => void;
  setGlow: (glow: GlowPreset) => void;
  setMapTheme: (mapTheme: MapTheme) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'imperial',
      keepScreenOn: true,
      appearance: 'system',
      glow: 'ember',
      mapTheme: 'auto',
      setUnits: (units) => set({ units }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
      setAppearance: (appearance) => set({ appearance }),
      setGlow: (glow) => set({ glow }),
      setMapTheme: (mapTheme) => set({ mapTheme }),
    }),
    { name: 'convoy-settings', storage: createJSONStorage(() => AsyncStorage) }
  )
);
