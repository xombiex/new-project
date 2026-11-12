import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Display, Fonts, ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'display' | 'label' | 'caption' | 'lead' | 'heading' | 'metric';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  /** Big italic screen titles */
  display: {
    fontFamily: Display.italic,
    ...TypeScale.display,
  },
  /** Section and sheet headings */
  heading: {
    fontFamily: Display.bold,
    ...TypeScale.heading,
    letterSpacing: 0.3,
  },
  /** Numbers on a card: distance, time, speed */
  metric: {
    fontFamily: Display.italic,
    ...TypeScale.metric,
    fontVariant: ['tabular-nums'],
  },
  /** Stamped labels: section headings, captions on readouts */
  label: {
    fontFamily: Display.semi,
    ...TypeScale.label,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  /** Names in lists, card headings */
  lead: {
    ...TypeScale.lead,
    fontWeight: 700,
  },
  caption: {
    ...TypeScale.caption,
    fontWeight: 600,
  },
  small: {
    ...TypeScale.small,
    fontWeight: 500,
  },
  smallBold: {
    ...TypeScale.small,
    fontWeight: 700,
  },
  default: {
    ...TypeScale.body,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
