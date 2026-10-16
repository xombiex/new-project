import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConvoyMap, type MapLine, type MapPerson } from '@/components/map/convoy-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Stat, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shareTextFile } from '@/lib/export-file';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { toGpx } from '@/lib/gpx';
import { hideZones } from '@/lib/privacy';
import { buildTrack, positionAt } from '@/lib/replay';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { useAuth } from '@/store/auth';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

/** Whole drive plays back in this long regardless of its length. */
const REPLAY_MS = 12_000;

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { units, privacyZones } = useSettings();
  const profile = useAuth((s) => s.profile);
  const pro = useEntitled('pro');
  const trip = useTrips((s) => s.history.find((t) => t.id === id));
  const { rename, remove } = useTrips();
  const [name, setName] = useState(trip?.name ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [replay, setReplay] = useState<{ playing: boolean; f: number } | null>(null);
  const frame = useRef<number | null>(null);

  const track = useMemo(() => buildTrack(trip?.path ?? []), [trip?.path]);

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

  const title = trip.name ?? `${new Date(trip.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} drive`;
  const unit = speedUnitLabel(units);
  const dirty = name !== (trip.name ?? '') || notes !== (trip.notes ?? '');

  let lines: MapLine[] = [{ id: 'trip', coords: trip.path, color: theme.speed, width: 5, variant: 'glow' }];
  let people: MapPerson[] = [];
  if (replay) {
    const pos = positionAt(track, replay.f);
    lines = [
      { id: 'trip', coords: trip.path, color: theme.speed, width: 5, variant: 'glow', opacity: 0.2 },
      { id: 'replay', coords: pos.drawn, color: theme.speed, width: 6, variant: 'glow' },
    ];
    people = [
      {
        id: 'me',
        name: profile?.display_name ?? 'Me',
        color: profile?.avatar_color ?? theme.accent,
        coord: pos.head,
        heading: pos.heading,
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

  async function exportGpx() {
    if (!pro) {
      router.push('/paywall');
      return;
    }
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

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ paddingBottom: Spacing.six }}>
        <View>
          <ConvoyMap style={{ height: 320 }} showUser={false} lines={lines} people={people} fit={{ key: trip.id, points: trip.path }} />
          <Pressable
            onPress={toggleReplay}
            accessibilityRole="button"
            accessibilityLabel={replay?.playing ? 'Pause replay' : 'Replay drive'}
            style={[styles.replayBtn, { backgroundColor: theme.backgroundElement }]}>
            <MaterialCommunityIcons
              name={replay?.playing ? 'pause' : replay && replay.f < 1 ? 'play' : 'play-circle-outline'}
              size={22}
              color={theme.text}
            />
            <ThemedText type="smallBold">{replay ? (replay.playing ? 'Pause' : replay.f >= 1 ? 'Replay' : 'Resume') : 'Replay'}</ThemedText>
            {!pro ? <MaterialCommunityIcons name="lock" size={14} color={theme.textSecondary} /> : null}
          </Pressable>
          {replay ? (
            <View style={[styles.progress, { backgroundColor: theme.backgroundSelected }]}>
              <View style={{ width: `${replay.f * 100}%`, height: '100%', backgroundColor: theme.speed }} />
            </View>
          ) : null}
        </View>
        <View style={{ padding: Spacing.three, gap: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(trip.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} –{' '}
            {new Date(trip.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
          <Card style={{ gap: Spacing.three }}>
            <View style={styles.row}>
              <Stat label="Distance" value={formatDistance(units, trip.distanceM)} />
              <Stat label="Total time" value={formatDuration((trip.endedAt - trip.startedAt) / 1000)} />
              <Stat label="Moving" value={formatDuration(trip.movingS)} />
            </View>
            <View style={styles.row}>
              <Stat label={`Avg ${unit}`} value={String(Math.round(speedIn(units, averageSpeedMps(trip))))} />
              <Stat label={`Top ${unit}`} value={String(Math.round(speedIn(units, trip.maxSpeedMps)))} color={theme.speed} />
            </View>
          </Card>
          <View style={styles.actions}>
            <Button
              label="Share card"
              icon={<MaterialCommunityIcons name="image-outline" size={20} color={theme.accentText} />}
              onPress={() => router.push({ pathname: '/share/[id]', params: { id: trip.id } })}
              style={{ flex: 1 }}
            />
            <Button
              label={pro ? 'Export GPX' : 'GPX 🔒'}
              variant="secondary"
              icon={<MaterialCommunityIcons name="file-export-outline" size={20} color={theme.text} />}
              onPress={exportGpx}
              style={{ flex: 1 }}
            />
          </View>
          <Card style={{ gap: Spacing.three }}>
            <TextField label="Name" value={name} onChangeText={setName} placeholder={title} maxLength={80} />
            <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} style={{ minHeight: 80, paddingTop: 12 }} />
            <Button label="Save" disabled={!dirty} onPress={() => rename(trip.id, name.trim(), notes.trim() || null)} />
          </Card>
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
  row: { flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  replayBtn: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    height: 40,
    borderRadius: Radius.pill,
  },
  progress: { height: 3 },
});
