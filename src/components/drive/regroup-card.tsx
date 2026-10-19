import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, haversine, type LngLat, type Units } from '@/lib/geo';
import { pickSpots, placesAround, REGROUP_HERE_M, regroupTarget, type RegroupSpot } from '@/lib/regroup';
import { useDrive, type GroupDrive, type Member } from '@/store/drive';

type Props = {
  drive: GroupDrive;
  members: Record<string, Member>;
  myId: string | null;
  me: LngLat | null;
  myHeading: number | null;
  isOwner: boolean;
  units: Units;
  onNavigate: (spot: { name: string; coord: LngLat }) => void;
};

/** "Regroup at …": the leader picks a spot ahead; everyone sees it, who's there and who's coming. */
export function RegroupCard({ drive, members, myId, me, myHeading, isOwner, units, onNavigate }: Props) {
  const theme = useTheme();
  const [spots, setSpots] = useState<RegroupSpot[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spot = drive.regroup_lat != null && drive.regroup_lng != null && drive.regroup_name ? { name: drive.regroup_name, coord: [drive.regroup_lng, drive.regroup_lat] as LngLat } : null;

  async function find() {
    setFinding(true);
    setError(null);
    try {
      const group: LngLat[] = Object.entries(members)
        .map(([id, m]) => (id === myId && me ? me : m.position ? ([m.position.lng, m.position.lat] as LngLat) : null))
        .filter((p): p is LngLat => p != null);
      if (me && !group.length) group.push(me);
      const dest: LngLat | null = drive.dest_lat != null && drive.dest_lng != null ? [drive.dest_lng, drive.dest_lat] : null;
      const target = regroupTarget(group, dest, myHeading);
      if (!target || !me) throw new Error('Waiting for locations');
      const found = pickSpots(await placesAround(target), target, me);
      if (!found.length) throw new Error('No gas stations or parking found nearby. Try again a little further on.');
      setSpots(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t find a spot');
    } finally {
      setFinding(false);
    }
  }

  async function choose(s: RegroupSpot) {
    const err = await useDrive.getState().setRegroup({ name: s.name, lat: s.coord[1], lng: s.coord[0] });
    if (err) setError(err);
    else setSpots(null);
  }

  // A regroup point is set: where, how far, who's there.
  if (spot) {
    const people = Object.entries(members).map(([id, m]) => {
      const pos = id === myId && me ? me : m.position ? ([m.position.lng, m.position.lat] as LngLat) : null;
      return { id, name: id === myId ? 'You' : m.profile.display_name.split(' ')[0], away: pos ? haversine(pos, spot.coord) : null };
    });
    const here = people.filter((p) => p.away != null && p.away <= REGROUP_HERE_M);
    const coming = people.filter((p) => !here.includes(p)).sort((a, b) => (a.away ?? Infinity) - (b.away ?? Infinity));
    const mine = me ? haversine(me, spot.coord) : null;
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <Card style={[styles.card, { borderColor: theme.accent }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: theme.accent }]}>
              <MaterialCommunityIcons name="map-marker-radius" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="small" themeColor="textSecondary">
                Regroup at
              </ThemedText>
              <ThemedText style={{ fontWeight: 800, fontSize: 17 }} numberOfLines={1}>
                {spot.name}
              </ThemedText>
            </View>
            {mine != null && mine > REGROUP_HERE_M ? <Button label={`Go · ${formatDistance(units, mine)}`} onPress={() => onNavigate(spot)} /> : null}
          </View>
          <ThemedText type="small">
            <ThemedText type="smallBold" style={{ color: theme.success }}>
              {here.length}/{people.length} here
            </ThemedText>
            {here.length ? ` · ${here.map((p) => p.name).join(', ')}` : ''}
          </ThemedText>
          {coming.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              On the way: {coming.map((p) => `${p.name}${p.away != null ? ` (${formatDistance(units, p.away)})` : ''}`).join(', ')}
            </ThemedText>
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.success }}>
              Everyone’s here. Ready to roll!
            </ThemedText>
          )}
          {isOwner ? (
            <Button
              label="Clear regroup point"
              variant="ghost"
              onPress={() =>
                Alert.alert('Clear the regroup point?', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => void useDrive.getState().setRegroup(null) },
                ])
              }
            />
          ) : null}
        </Card>
      </Animated.View>
    );
  }

  if (!isOwner) return null;

  // Leader: find a place ahead and pick one.
  return (
    <Card style={{ gap: Spacing.two }}>
      {spots ? (
        <>
          <ThemedText style={{ fontWeight: 800 }}>Pick a regroup spot</ThemedText>
          {spots.map((s) => (
            <Pressable
              key={`${s.name}-${s.coord.join()}`}
              onPress={() => void choose(s)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
              <MaterialCommunityIcons name={s.kind === 'fuel' ? 'gas-station' : 'parking'} size={22} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>
                  {s.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDistance(units, s.distanceM)} from you
                </ThemedText>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          ))}
          <Button label="Cancel" variant="ghost" onPress={() => setSpots(null)} />
        </>
      ) : (
        <View style={styles.row}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={24} color={theme.textSecondary} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>Regroup</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Someone got split up? Pick a gas station ahead and everyone gets routed there.
            </ThemedText>
          </View>
          {finding ? <ActivityIndicator color={theme.accent} /> : <Button label="Find spot" variant="secondary" onPress={() => void find()} />}
        </View>
      )}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.md },
});
