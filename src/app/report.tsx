import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { REPORT_TYPES, type ReportType } from '@/lib/reports';
import { useAuth } from '@/store/auth';
import { useReports } from '@/store/reports';
import { useTrips } from '@/store/trips';

/** Two taps to report: open, pick a type. Location is where you are when the sheet opened. */
export default function ReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const signedIn = useAuth((s) => Boolean(s.profile));
  const [at] = useState(() => {
    const s = useTrips.getState().lastSample;
    return s ? ([s.lng, s.lat] as [number, number]) : null;
  });
  const [busy, setBusy] = useState<ReportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function report(type: ReportType) {
    if (!at) return;
    setBusy(type);
    const err = await useReports.getState().create(type, at);
    setBusy(null);
    if (err) setError(err);
    else router.back();
  }

  if (!signedIn) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText style={{ textAlign: 'center' }}>Sign in to report what you see on the road.</ThemedText>
        <Button label="Sign in" onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: Spacing.three, gap: Spacing.three }}>
      <ThemedText themeColor="textSecondary">
        {at ? 'Reported at your current location. Passengers, please do the tapping.' : 'Waiting for GPS…'}
      </ThemedText>
      <View style={styles.grid}>
        {REPORT_TYPES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => void report(t.value)}
            disabled={!at || busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`Report ${t.label}`}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: t.color, opacity: !at ? 0.4 : pressed || busy === t.value ? 0.7 : 1 },
            ]}>
            <MaterialCommunityIcons name={t.icon as 'alert'} size={40} color="#fff" />
            <ThemedText style={styles.label}>{t.label}</ThemedText>
          </Pressable>
        ))}
      </View>
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: {
    width: '47%',
    flexGrow: 1,
    aspectRatio: 1.4,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  label: { color: '#fff', fontSize: 18, fontWeight: 800 },
});
