/** Colors for the heat-trail route glow: outer haze → glow → core. */
export type GlowPalette = { haze: string; glow: string; core: string };

export type GlowPreset = 'ember' | 'ice' | 'toxic' | 'violet' | 'gold';

/**
 * On dark maps the core is near-white (hot); on light maps a white core would vanish,
 * so the core is the deepest shade instead.
 */
export const GLOW_PRESETS: Record<GlowPreset, { label: string; premium: boolean; dark: GlowPalette; light: GlowPalette }> = {
  ember: {
    label: 'Ember',
    premium: false,
    dark: { haze: '#E0263C', glow: '#FF8A1F', core: '#FFF1DC' },
    light: { haze: '#FF5A36', glow: '#FF8A1F', core: '#B4410C' },
  },
  ice: {
    label: 'Ice',
    premium: true,
    dark: { haze: '#1D4ED8', glow: '#38BDF8', core: '#E0F7FF' },
    light: { haze: '#60A5FA', glow: '#0EA5E9', core: '#075985' },
  },
  toxic: {
    label: 'Toxic',
    premium: true,
    dark: { haze: '#15803D', glow: '#4ADE80', core: '#ECFFE9' },
    light: { haze: '#86EFAC', glow: '#22C55E', core: '#14532D' },
  },
  violet: {
    label: 'Violet',
    premium: true,
    dark: { haze: '#7E22CE', glow: '#C084FC', core: '#F7EDFF' },
    light: { haze: '#D8B4FE', glow: '#A855F7', core: '#581C87' },
  },
  gold: {
    label: 'Gold',
    premium: true,
    dark: { haze: '#B45309', glow: '#FBBF24', core: '#FFFBEB' },
    light: { haze: '#FCD34D', glow: '#F59E0B', core: '#78350F' },
  },
};
