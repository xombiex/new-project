import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Glass } from '@/components/glass';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useLocationPermission } from '@/hooks/use-location-permission';
import { useTheme } from '@/hooks/use-theme';
import { useTrips } from '@/store/trips';

const WEB_BLOCKED =
  'Location is blocked for this site. Click the icon at the left of the address bar, allow Location, then reload the page.';

/** Asks for location when Convoy doesn't have it yet. Renders nothing once access is granted. */
export function LocationPrompt() {
  const theme = useTheme();
  const { access, request } = useLocationPermission();
  const [busy, setBusy] = useState(false);
  const [blockedAfterAsk, setBlockedAfterAsk] = useState(false);
  // A GPS fix proves we have access, even where the browser's permission API says otherwise.
  const hasFix = useTrips((s) => s.lastSample != null);

  if (access === 'checking' || access === 'granted' || hasFix) return null;
  const blocked = access === 'blocked' || blockedAfterAsk;

  async function onAllow() {
    setBusy(true);
    const result = await request();
    setBusy(false);
    // Browsers report a dismissed or denied prompt the same way; show how to fix it.
    if (result !== 'granted' && Platform.OS === 'web') setBlockedAfterAsk(true);
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Glass style={styles.card}>
        <View style={[styles.icon, { backgroundColor: theme.accent }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={28} color="#fff" />
        </View>
        <ThemedText type="subtitle" style={styles.center}>
          Turn on location
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {blocked && Platform.OS === 'web'
            ? WEB_BLOCKED
            : 'Convoy uses your location to show you on the map, measure your speed, record trips and share with your group, only when you choose.'}
        </ThemedText>
        {blocked && Platform.OS !== 'web' ? (
          <Button label="Open Settings" size="lg" onPress={() => void Linking.openSettings()} style={styles.button} />
        ) : blocked ? (
          <Button label="Try again" variant="secondary" size="lg" loading={busy} onPress={onAllow} style={styles.button} />
        ) : (
          <Button label="Allow location" size="lg" loading={busy} onPress={onAllow} style={styles.button} />
        )}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  // Centered over the map, clear of the speed panel at the bottom.
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 200, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: { width: '100%', maxWidth: 380, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two, alignItems: 'center' },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: Spacing.two },
});
