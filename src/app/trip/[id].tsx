import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';

import { ConvoyMap } from '@/components/map/convoy-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Stat, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const trip = useTrips((s) => s.history.find((t) => t.id === id));
  const { rename, remove } = useTrips();
  const [name, setName] = useState(trip?.name ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? '');

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

  function share() {
    void Share.share({
      message:
        `${title}: ${formatDistance(units, trip!.distanceM)} in ${formatDuration((trip!.endedAt - trip!.startedAt) / 1000)}, ` +
        `${Math.round(speedIn(units, averageSpeedMps(trip!)))} ${unit} average. Tracked with Convoy.`,
    });
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
        <ConvoyMap
          style={{ height: 300 }}
          showUser={false}
          lines={[{ id: 'trip', coords: trip.path, color: theme.accent, width: 5 }]}
          fit={{ key: trip.id, points: trip.path }}
        />
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
              <Stat label={`Top ${unit}`} value={String(Math.round(speedIn(units, trip.maxSpeedMps)))} />
            </View>
          </Card>
          <Card style={{ gap: Spacing.three }}>
            <TextField label="Name" value={name} onChangeText={setName} placeholder={title} maxLength={80} />
            <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} style={{ minHeight: 80, paddingTop: 12 }} />
            <Button label="Save" disabled={!dirty} onPress={() => rename(trip.id, name.trim(), notes.trim() || null)} />
          </Card>
          <Button label="Share summary" variant="secondary" onPress={share} />
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
});
