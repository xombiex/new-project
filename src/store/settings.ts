import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Units } from '@/lib/geo';

type SettingsState = {
  units: Units;
  keepScreenOn: boolean;
  setUnits: (units: Units) => void;
  setKeepScreenOn: (on: boolean) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'imperial',
      keepScreenOn: true,
      setUnits: (units) => set({ units }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
    }),
    { name: 'convoy-settings', storage: createJSONStorage(() => AsyncStorage) }
  )
);
