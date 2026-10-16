/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0A0A0B',
    background: '#F2F3F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EBEDF0',
    textSecondary: '#6B7280',
    border: 'rgba(10,10,11,0.08)',
    accent: '#0A84FF',
    accentText: '#FFFFFF',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#E5372B',
    speed: '#F07A0A',
    chip: 'rgba(255,255,255,0.75)',
    /** tint laid over the blurred map for floating panels */
    glass: 'rgba(255,255,255,0.62)',
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
    /** tint laid over the blurred map for floating panels */
    glass: 'rgba(17,18,20,0.78)',
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
