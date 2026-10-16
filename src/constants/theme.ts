/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    background: '#F3F5F9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E4E8EF',
    textSecondary: '#5B6576',
    border: '#DCE1E9',
    accent: '#2563EB',
    accentText: '#FFFFFF',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    speed: '#E8890C',
    chip: '#E4E8EF',
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    backgroundElement: '#111214',
    backgroundSelected: '#1C1D21',
    textSecondary: '#A1A1AA',
    border: '#232428',
    accent: '#1E9BFF',
    accentText: '#FFFFFF',
    success: '#30D158',
    warning: '#FF9F0A',
    danger: '#FF453A',
    /** speed figures (top speed, speedometer accents) */
    speed: '#FFA630',
    /** unselected filter chips */
    chip: '#17181B',
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
