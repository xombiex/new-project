/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1814',
    background: '#F3F0E8',
    backgroundElement: '#FFFDF8',
    backgroundSelected: '#E9E5DA',
    textSecondary: '#6E695C',
    border: 'rgba(26,24,20,0.10)',
    accent: '#D9500A',
    accentText: '#FFFFFF',
    success: '#15803D',
    warning: '#B45309',
    danger: '#D92D20',
    speed: '#D9500A',
    chip: 'rgba(255,253,248,0.8)',
    /** tint laid over the blurred map for floating panels */
    glass: 'rgba(255,253,248,0.7)',
  },
  dark: {
    text: '#F6F2E9',
    background: '#0D0C0A',
    backgroundElement: '#181714',
    backgroundSelected: '#24221E',
    textSecondary: '#A9A497',
    border: '#2E2B26',
    accent: '#F0600F',
    accentText: '#FFFFFF',
    success: '#4CCB6E',
    warning: '#F5A524',
    danger: '#FF4D3D',
    /** speed figures (top speed, speedometer accents) */
    speed: '#F0600F',
    /** unselected filter chips */
    chip: '#1D1B18',
    /** tint laid over the blurred map for floating panels */
    glass: 'rgba(24,23,20,0.82)',
  },
} as const;

/** Distinct, high-contrast colors for people on the map. */
export const AvatarColors = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#A855F7', '#EC4899', '#14B8A6', '#F97316'];

export const Radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Barlow Condensed: drawn after California license plates, highway signs and buses. The italic is
 * for big readouts and titles, upright for buttons and stamped labels. Body text stays the system
 * font. Set no fontWeight with these: the weight is in the family name.
 */
export const Display = {
  italic: 'BarlowCondensed_700Bold_Italic',
  bold: 'BarlowCondensed_700Bold',
  semi: 'BarlowCondensed_600SemiBold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
