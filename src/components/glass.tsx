import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Frosted panel for anything floating over the map: blurred backdrop + a tint,
 * white glass in light mode and smoked glass in dark mode.
 */
export function Glass({
  children,
  style,
  intensity = 40,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  const scheme = useColorScheme();
  const theme = useTheme();
  return (
    <View
      style={[
        styles.base,
        { borderColor: scheme === 'light' ? 'rgba(255,255,255,0.9)' : theme.border },
        scheme === 'light' && styles.lightShadow,
        style,
      ]}>
      <BlurView
        intensity={intensity}
        tint={scheme === 'light' ? 'systemChromeMaterialLight' : 'systemChromeMaterialDark'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  lightShadow: {
    shadowColor: '#0A0A0B',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
