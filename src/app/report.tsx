import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CAMERA_COLOR, type CameraKind } from '@/lib/cameras';
import { REPORT_TYPES, type ReportType } from '@/lib/reports';
import { useAuth } from '@/store/auth';
import { useCameras } from '@/store/cameras';
import { useReports } from '@/store/reports';
import { useTrips } from '@/store/trips';

const CAMERA_TILES: { kind: CameraKind; label: string; icon: string }[] = [
  { kind: 'speed', label: 'Speed camera', icon: 'speedometer' },
  { kind: 'redlight', label: 'Red light camera', icon: 'traffic-light' },
  { kind: 'alpr', label: 'Plate reader (Flock)', icon: 'cctv' },
];

/** Two taps to report: open, pick a type. Location is where you are when the sheet opened. */
export default function ReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const signedIn = useAuth((s) => Boolean(s.profile));
  const [at] = useState(() => {
    const s = useTrips.getState().lastSample;
    return s ? { coord: [s.lng, s.lat] as [number, number], heading: s.speed != null && s.speed > 2 ? s.heading : null } : null;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);

  async function report(type: ReportType) {
    if (!at) return;
    setBusy(type);
    const err = await useReports.getState().create(type, at.coord);
    setBusy(null);
    if (err) setError(err);
    else router.back();
  }

  async function reportCamera(kind: CameraKind) {
    if (!at) return;
    setBusy(kind);
    // The way you're driving tells which direction the camera watches.
    const res = await useCameras.getState().report(kind, at.coord, at.heading ?? null);
    setBusy(null);
    if (!res.ok) setError(res.message);
    else {
      setThanks(res.message);
      setTimeout(() => router.back(), 2600);
    }
  }

  if (!signedIn) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText style={{ textAlign: 'center' }}>Sign in to report what you see on the road.</ThemedText>
        <Button label="Sign in" onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }

  if (thanks) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.badge, { backgroundColor: theme.accent }]}>
          <MaterialCommunityIcons name="binoculars" size={40} color="#fff" />
        </Animated.View>
        <ThemedText style={{ textAlign: 'center', fontWeight: 700, fontSize: 17 }}>{thanks}</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
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

      <View style={{ gap: Spacing.one, marginTop: Spacing.two }}>
        <ThemedText style={{ fontSize: 20, fontWeight: 800 }}>Cameras</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Spotted one that isn’t on the map? It appears as a “?” until other drivers confirm it, then everyone gets alerts. Confirmed finds earn
          you Camera Scout points.
        </ThemedText>
      </View>
      <View style={styles.camRow}>
        {CAMERA_TILES.map((t) => (
          <Pressable
            key={t.kind}
            onPress={() => void reportCamera(t.kind)}
            disabled={!at || busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`Report ${t.label}`}
            style={({ pressed }) => [styles.camTile, { backgroundColor: CAMERA_COLOR[t.kind], opacity: !at ? 0.4 : pressed || busy === t.kind ? 0.7 : 1 }]}>
            <MaterialCommunityIcons name={t.icon as 'cctv'} size={32} color="#fff" />
            <ThemedText style={styles.camLabel}>{t.label}</ThemedText>
          </Pressable>
        ))}
      </View>
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
    </ScrollView>
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
  camRow: { flexDirection: 'row', gap: Spacing.two },
  camTile: { flex: 1, minHeight: 104, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, padding: Spacing.two },
  camLabel: { color: '#fff', fontSize: 13, lineHeight: 16, fontWeight: 800, textAlign: 'center' },
  badge: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
});
