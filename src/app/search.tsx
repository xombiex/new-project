import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LngLat } from '@/lib/geo';
import { searchPlaces, type Place } from '@/lib/places';
import { useDrive } from '@/store/drive';
import { useNav } from '@/store/nav';
import { useTrips } from '@/store/trips';

export default function SearchScreen() {
  const { purpose } = useLocalSearchParams<{ purpose?: 'route' | 'drive' }>();
  const theme = useTheme();
  const router = useRouter();
  const last = useTrips((s) => s.lastSample);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const near: LngLat | undefined = last ? [last.lng, last.lat] : undefined;

  // Debounced search; aborts stale requests so results never arrive out of order.
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await searchPlaces(query, near, ctrl.signal));
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // `near` is only a bias; don't re-search every time GPS ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function pick(place: Place) {
    if (purpose === 'drive') {
      const err = await useDrive.getState().setDestination({ name: place.name, lat: place.coord[1], lng: place.coord[0] });
      if (err) {
        setError(err);
        return;
      }
    } else {
      if (!near) {
        setError('Waiting for your location before planning a route');
        return;
      }
      void useNav.getState().planTo(place, near);
    }
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: Spacing.three, gap: Spacing.three }}>
      <TextField
        autoFocus
        placeholder={purpose === 'drive' ? 'Group destination' : 'Search address or place'}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        autoCorrect={false}
        error={error}
      />
      {loading ? <ActivityIndicator color={theme.accent} /> : null}
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={styles.row} accessibilityRole="button">
            <MaterialCommunityIcons name="map-marker-outline" size={22} color={theme.textSecondary} />
            <View style={{ flex: 1 }}>
              <ThemedText numberOfLines={1} style={{ fontWeight: 600 }}>
                {item.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {item.detail}
              </ThemedText>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.three }}>
            Search data © OpenStreetMap contributors
          </ThemedText>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
});
