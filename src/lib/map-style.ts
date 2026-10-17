/** OpenFreeMap: free vector tiles with no API key or usage limits. */
const BASE = process.env.EXPO_PUBLIC_MAP_STYLE_BASE_URL ?? 'https://tiles.openfreemap.org/styles';

/** 'auto' follows light/dark mode; the rest are fixed looks (cosmetic unlocks). */
export type MapTheme = 'auto' | 'fiord' | 'liberty' | 'bright' | 'blocks' | 'neon';

export const MAP_THEMES: { value: MapTheme; label: string; premium: boolean }[] = [
  { value: 'auto', label: 'Auto', premium: false },
  { value: 'fiord', label: 'Midnight', premium: true },
  { value: 'liberty', label: 'Streets', premium: true },
  { value: 'bright', label: 'Bright', premium: true },
  { value: 'blocks', label: 'Blocks', premium: true },
  { value: 'neon', label: 'Neon City', premium: true },
];

export function mapStyleUrl(theme: MapTheme, scheme: 'light' | 'dark'): string {
  if (theme === 'auto') return `${BASE}/${scheme === 'dark' ? 'dark' : 'positron'}`;
  // Blocks and Neon City are built from the dark style (lib/blocks-theme, lib/neon-theme).
  if (theme === 'blocks' || theme === 'neon') return `${BASE}/dark`;
  return `${BASE}/${theme}`;
}
