import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchPlaces, type Place } from '@/lib/places';
import { useTrips } from '@/store/trips';

export type PickedPlace = { name: string; lat: number; lng: number } | null;

/** Search field that resolves to a place (OpenStreetMap search, biased near the user). */
export function PlaceField({ label, value, onChange }: { label: string; value: PickedPlace; onChange: (p: PickedPlace) => void }) {
  const theme = useTheme();
  const last = useTrips((s) => s.lastSample);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(query, last ? [last.lng, last.lat] : undefined, ctrl.signal)
        .then((r) => setResults(r.slice(0, 5)))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (value) {
    return (
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
        <View style={[styles.picked, { backgroundColor: theme.backgroundSelected }]}>
          <MaterialCommunityIcons name="map-marker" size={20} color={theme.accent} />
          <ThemedText style={{ flex: 1 }} numberOfLines={1}>
            {value.name}
          </ThemedText>
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <MaterialCommunityIcons name="close-circle" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.one }}>
      <TextField label={label} value={query} onChangeText={setQuery} placeholder="Search a place" autoCorrect={false} />
      {results.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            onChange({ name: p.name, lat: p.coord[1], lng: p.coord[0] });
            setQuery('');
            setResults([]);
          }}
          style={styles.result}
          accessibilityRole="button">
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={theme.textSecondary} />
          <View style={{ flex: 1 }}>
            <ThemedText numberOfLines={1} style={{ fontWeight: 600 }}>
              {p.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {p.detail}
            </ThemedText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  picked: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 50, paddingHorizontal: Spacing.three, borderRadius: 14 },
  result: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
});
