import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';

/** The scheme the app renders in: the user's choice, or the system's when set to "system". */
export function useColorScheme(): 'light' | 'dark' {
  const appearance = useSettings((s) => s.appearance);
  const system = useSystemColorScheme();
  if (appearance !== 'system') return appearance;
  return system === 'light' ? 'light' : 'dark';
}
