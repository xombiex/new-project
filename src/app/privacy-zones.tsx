import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Segmented, SectionTitle, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance } from '@/lib/geo';
import { searchPlaces, type Place } from '@/lib/places';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

const RADII = ['200', '400', '800'] as const;

export default function PrivacyZonesScreen() {
  const theme = useTheme();
  const { privacyZones, addPrivacyZone, removePrivacyZone, units } = useSettings();
  const last = useTrips((s) => s.lastSample);
  const [name, setName] = useState('Home');
  const [radius, setRadius] = useState<(typeof RADII)[number]>('400');
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
        .then(setResults)
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function add(lat: number, lng: number) {
    addPrivacyZone({ id: Crypto.randomUUID(), name: name.trim() || 'Private place', lat, lng, radiusM: Number(radius) });
    setQuery('');
    setResults([]);
    setName('');
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six }}
      keyboardShouldPersistTaps="handled">
      <ThemedText themeColor="textSecondary">
        Routes you share (cards, GPX exports) skip anything inside these zones, and friends won&apos;t get location updates
        while you&apos;re in one. Zones are stored on this phone only.
      </ThemedText>

      <SectionTitle>{`Your zones · ${privacyZones.length}`}</SectionTitle>
      {privacyZones.length === 0 ? (
        <ThemedText themeColor="textSecondary">No zones yet. Add your home or work below.</ThemedText>
      ) : (
        <Card style={{ paddingVertical: Spacing.one }}>
          {privacyZones.map((z, i) => (
            <View key={z.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <MaterialCommunityIcons name="shield-home-outline" size={24} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: 700 }}>{z.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDistance(units, z.radiusM)} radius
                </ThemedText>
              </View>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${z.name}`}
                onPress={() =>
                  Alert.alert(`Remove ${z.name}?`, undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removePrivacyZone(z.id) },
                  ])
                }>
                <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>Add a zone</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Home" maxLength={30} />
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Radius
          </ThemedText>
          <Segmented
            options={RADII.map((r) => ({ value: r, label: formatDistance(units, Number(r)) }))}
            value={radius}
            onChange={setRadius}
          />
        </View>
        <Button
          label="Use my current location"
          variant="secondary"
          disabled={!last}
          onPress={() => last && add(last.lat, last.lng)}
        />
        <TextField label="Or search an address" value={query} onChangeText={setQuery} placeholder="123 Main St" autoCorrect={false} />
        {results.map((p) => (
          <Pressable key={p.id} onPress={() => add(p.coord[1], p.coord[0])} style={styles.result} accessibilityRole="button">
            <MaterialCommunityIcons name="map-marker-outline" size={20} color={theme.textSecondary} />
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
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  result: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
});
