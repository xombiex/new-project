import type { StyleSpecification } from 'maplibre-gl';
import { useEffect, useState } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { blocksStyle } from '@/lib/blocks-theme';
import { neonStyle } from '@/lib/neon-theme';
import { GLOW_PRESETS } from '@/lib/glow';
import { mapStyleUrl, type MapTheme } from '@/lib/map-style';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';

/** Themes made by transforming a base style instead of loading one as-is. */
export type ThemeVariant = 'blocks' | 'neon';
const TRANSFORMS: Record<ThemeVariant, (s: StyleSpecification) => StyleSpecification> = { blocks: blocksStyle, neon: neonStyle };

/** Transformed styles, built once per theme (stable identity, so maps don't rebuild). */
const built = new Map<string, Promise<StyleSpecification>>();

function buildTheme(variant: ThemeVariant, url: string) {
  const key = `${variant}:${url}`;
  if (!built.has(key)) {
    built.set(
      key,
      fetch(url)
        .then((r) => r.json() as Promise<StyleSpecification>)
        .then(TRANSFORMS[variant])
        .catch((e) => {
          built.delete(key);
          throw e;
        })
    );
  }
  return built.get(key)!;
}

/** Map style + glow colors for the current scheme and the user's (unlocked) choices. */
export function useMapLook() {
  const scheme = useColorScheme();
  const glow = useSettings((s) => s.glow);
  const mapTheme = useSettings((s) => s.mapTheme);
  const cosmetics = useEntitled('cosmetics');
  // Fall back to the free look if an unlock lapses.
  const preset = GLOW_PRESETS[glow] && (!GLOW_PRESETS[glow].premium || cosmetics) ? GLOW_PRESETS[glow] : GLOW_PRESETS.ember;
  const theme: MapTheme = mapTheme === 'auto' || cosmetics ? mapTheme : 'auto';
  const styleUrl = mapStyleUrl(theme, scheme);
  const variant: ThemeVariant | null = theme === 'blocks' || theme === 'neon' ? theme : null;
  // Built themes start from the dark style; until the transform is ready, show the plain dark map.
  const [style, setStyle] = useState<string | StyleSpecification>(styleUrl);
  useEffect(() => {
    if (!variant) {
      setStyle(styleUrl);
      return;
    }
    let live = true;
    buildTheme(variant, styleUrl).then(
      (s) => live && setStyle(s),
      () => live && setStyle(styleUrl)
    );
    return () => {
      live = false;
    };
  }, [variant, styleUrl]);

  const dark = variant ? ('dark' as const) : scheme;
  return { styleUrl, style, variant, blocks: variant === 'blocks', glow: preset[dark], scheme: dark };
}
