/**
 * Convoy ships dark-only for now (night-driving friendly, matches the map).
 * Everything reads the scheme through this hook, so adding a light mode later is a one-line change.
 */
export function useColorScheme(): 'light' | 'dark' {
  return 'dark';
}
