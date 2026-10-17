import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConvoyMap, type MapLine, type MapPerson } from '@/components/map/convoy-map';
import { sideImage } from '@/components/map/vehicle-sprites';
import { Scrubber } from '@/components/scrubber';
import { SpeedDistribution } from '@/components/speed-distribution';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shareTextFile } from '@/lib/export-file';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { toGpx } from '@/lib/gpx';
import { hideZones } from '@/lib/privacy';
import { buildTrack, positionAt } from '@/lib/replay';
import { routeByBand } from '@/lib/speed-bands';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { useAuth } from '@/store/auth';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

/** Whole drive plays back in this long regardless of its length. */
const REPLAY_MS = 12_000;

/** "April 12th, 1:48 PM" */
function tripTitle(t: number) {
  const d = new Date(t);
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  return `${month} ${day}${suffix}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { units, privacyZones } = useSettings();
  const profile = useAuth((s) => s.profile);
  const pro = useEntitled('pro');
  const trip = useTrips((s) => s.history.find((t) => t.id === id));
  const { rename, remove, setRole } = useTrips();
  const [name, setName] = useState(trip?.name ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [replay, setReplay] = useState<{ playing: boolean; f: number } | null>(null);
  const frame = useRef<number | null>(null);

  const track = useMemo(() => buildTrack(trip?.path ?? []), [trip?.path]);
  const colored = useMemo(() => routeByBand(trip?.path ?? [], trip?.speeds, units), [trip?.path, trip?.speeds, units]);

  // Drive the replay with animation frames; progress lives in state so the map follows.
  useEffect(() => {
    if (!replay?.playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setReplay((r) => {
        if (!r || !r.playing) return r;
        const f = r.f + dt / REPLAY_MS;
        return f >= 1 ? { playing: false, f: 1 } : { playing: true, f };
      });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [replay?.playing]);

  if (!trip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ThemedText themeColor="textSecondary">Trip not found</ThemedText>
      </View>
    );
  }

  const unit = speedUnitLabel(units);
  const dirty = name !== (trip.name ?? '') || notes !== (trip.notes ?? '');
  const durationS = (trip.endedAt - trip.startedAt) / 1000;

  // Route colored by speed (falls back to the glow trail for older drives without speeds).
  const base: MapLine[] = colored.length
    ? colored.map((p, i) => ({ id: `speed-${i}`, coords: p.coords, color: p.color, width: 5 }))
    : [{ id: 'trip', coords: trip.path, color: theme.speed, width: 5, variant: 'glow' }];
  let lines: MapLine[] = base;
  let people: MapPerson[] = [];
  if (replay) {
    const pos = positionAt(track, replay.f);
    lines = [
      ...base.map((l) => ({ ...l, opacity: 0.25 })),
      { id: 'replay', coords: pos.drawn, color: theme.speed, width: 6, variant: 'glow' },
    ];
    people = [
      {
        id: 'me',
        name: profile?.display_name ?? 'Me',
        color: profile?.avatar_color ?? theme.accent,
        coord: pos.head,
        heading: pos.heading,
        vehicle: trip.car?.body ?? profile?.vehicle,
        paint: trip.car?.paint ?? profile?.vehicle_color,
      },
    ];
  }

  function toggleReplay() {
    if (!pro) {
      router.push('/paywall');
      return;
    }
    setReplay((r) => (!r || r.f >= 1 ? { playing: true, f: 0 } : { ...r, playing: !r.playing }));
  }

  function seek(f: number) {
    if (!pro) {
      router.push('/paywall');
      return;
    }
    setReplay({ playing: false, f });
  }

  async function exportGpx() {
    if (!pro) {
      router.push('/paywall');
      return;
    }
    const title = trip!.name ?? tripTitle(trip!.startedAt);
    const gpx = toGpx({ name: title, startedAt: trip!.startedAt, endedAt: trip!.endedAt, segments: hideZones(trip!.path, privacyZones) });
    const file = `convoy-${new Date(trip!.startedAt).toISOString().slice(0, 10)}.gpx`;
    try {
      await shareTextFile(file, gpx, 'application/gpx+xml', 'com.topografix.gpx');
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  }

  function confirmDelete() {
    Alert.alert('Delete trip?', 'This removes it from this phone and your cloud history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove(trip!.id);
          router.back();
        },
      },
    ]);
  }

  const role = trip.role ?? 'driver';
  const carBody = trip.car?.body ?? profile?.vehicle ?? 'car';
  const carPaint = trip.car?.paint ?? profile?.vehicle_color ?? 'blue';

  return (
    <>
      <Stack.Screen options={{ title: trip.name ?? 'Drive' }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ paddingBottom: Spacing.six }}>
        <ConvoyMap style={{ height: 340 }} showUser={false} lines={lines} people={people} fit={{ key: trip.id, points: trip.path }} />

        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          {/* Header: the car, when, how far and how long */}
          <View style={styles.header}>
            <Image source={sideImage(carBody, carPaint)} style={styles.headerCar} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {trip.name ?? tripTitle(trip.startedAt)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDistance(units, trip.distanceM)} · {formatDuration(durationS)}
              </ThemedText>
            </View>
          </View>

          {/* Vehicle and role */}
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              <MaterialCommunityIcons name="car-side" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.caps}>
                  Vehicle
                </ThemedText>
                <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>
                  {trip.car?.label ?? 'My car'}
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={() => setRole(trip.id, role === 'driver' ? 'passenger' : 'driver')}
              accessibilityRole="button"
              accessibilityLabel={`Role: ${role}. Tap to change.`}
              style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              <MaterialCommunityIcons name={role === 'driver' ? 'steering' : 'seat-passenger'} size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.caps}>
                  Role
                </ThemedText>
                <ThemedText style={{ fontWeight: 700 }}>{role === 'driver' ? 'Driver' : 'Passenger'}</ThemedText>
              </View>
              <MaterialCommunityIcons name="swap-horizontal" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* Key numbers */}
          <View style={styles.tiles}>
            {[
              { icon: 'map-marker-distance', label: 'Distance', value: formatDistance(units, trip.distanceM), color: theme.text },
              { icon: 'clock-outline', label: 'Duration', value: formatDuration(durationS), color: theme.text },
              { icon: 'speedometer', label: 'Top', value: `${Math.round(speedIn(units, trip.maxSpeedMps))} ${unit}`, color: theme.danger },
            ].map((t) => (
              <View key={t.label} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.tileLabel}>
                  <MaterialCommunityIcons name={t.icon as 'clock-outline'} size={14} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.caps}>
                    {t.label}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.tileValue, { color: t.color }]} numberOfLines={1} adjustsFontSizeToFit>
                  {t.value}
                </ThemedText>
              </View>
            ))}
          </View>

          <Card>
            <SpeedDistribution hist={trip.speedHist} units={units} />
          </Card>

          {/* Replay and share */}
          <View style={styles.replayRow}>
            <Pressable
              onPress={toggleReplay}
              accessibilityRole="button"
              accessibilityLabel={replay?.playing ? 'Pause replay' : 'Replay drive'}
              style={[styles.play, { backgroundColor: theme.backgroundElement }]}>
              <MaterialCommunityIcons name={replay?.playing ? 'pause' : pro ? 'play' : 'lock'} size={24} color={theme.text} />
            </Pressable>
            <Scrubber value={replay?.f ?? 0} onChange={seek} color={theme.accent} />
            <Button label="Share" onPress={() => router.push({ pathname: '/share/[id]', params: { id: trip.id } })} />
          </View>

          <View style={styles.more}>
            <ThemedText type="small" themeColor="textSecondary">
              Avg {Math.round(speedIn(units, averageSpeedMps(trip)))} {unit} · moving {formatDuration(trip.movingS)} ·{' '}
              {new Date(trip.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
              {new Date(trip.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </ThemedText>
          </View>

          <Card style={{ gap: Spacing.three }}>
            <TextField label="Name" value={name} onChangeText={setName} placeholder={tripTitle(trip.startedAt)} maxLength={80} />
            <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} style={{ minHeight: 80, paddingTop: 12 }} />
            <Button label="Save" disabled={!dirty} onPress={() => rename(trip.id, name.trim(), notes.trim() || null)} />
          </Card>
          <Button
            label={pro ? 'Export GPX' : 'Export GPX 🔒'}
            variant="secondary"
            icon={<MaterialCommunityIcons name="file-export-outline" size={20} color={theme.text} />}
            onPress={exportGpx}
          />
          <Button label="Delete trip" variant="ghost" onPress={confirmDelete} />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {trip.synced ? 'Backed up to your account' : 'Saved on this phone only. Sign in to back up trips.'}
          </ThemedText>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.three, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerCar: { width: 72, height: 36 },
  title: { fontSize: 22, fontWeight: 800 },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two + 2, borderRadius: Radius.md },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, padding: Spacing.two + 2, borderRadius: Radius.md, gap: 4 },
  tileLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileValue: { fontSize: 22, fontWeight: 800 },
  replayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  more: { alignItems: 'center' },
});
