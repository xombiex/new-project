import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapPerson } from './types';

/** MapLibre React Native has no web renderer; the browser build is for UI work only. */
export function ConvoyMap({ style, people = [], lines = [] }: ConvoyMapProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSelected }, style]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Map renders in the iOS / Android app
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {people.length} people · {lines.length} routes
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 4 },
});
