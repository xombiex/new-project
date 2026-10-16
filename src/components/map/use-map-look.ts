import { useColorScheme } from '@/hooks/use-color-scheme';
import { GLOW_PRESETS } from '@/lib/glow';
import { mapStyleUrl } from '@/lib/map-style';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';

/** Map style URL + glow colors for the current scheme and the user's (unlocked) choices. */
export function useMapLook() {
  const scheme = useColorScheme();
  const glow = useSettings((s) => s.glow);
  const mapTheme = useSettings((s) => s.mapTheme);
  const cosmetics = useEntitled('cosmetics');
  // Fall back to the free look if an unlock lapses.
  const preset = GLOW_PRESETS[glow] && (!GLOW_PRESETS[glow].premium || cosmetics) ? GLOW_PRESETS[glow] : GLOW_PRESETS.ember;
  const theme = mapTheme === 'auto' || cosmetics ? mapTheme : 'auto';
  return { styleUrl: mapStyleUrl(theme, scheme), glow: preset[scheme], scheme };
}
