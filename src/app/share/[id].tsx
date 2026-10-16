import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { CARD_STYLES, ShareCard, type CardStyle } from '@/components/share-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shareImage } from '@/lib/export-file';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { hideZones } from '@/lib/privacy';
import { formatDayOrdinal } from '@/lib/time';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const trip = useTrips((s) => s.history.find((t) => t.id === id));
  const { units, privacyZones } = useSettings();
  const pro = useEntitled('pro');
  const [style, setStyle] = useState<CardStyle>('night');
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<ComponentRef<typeof View>>(null);

  // Never share what's inside a privacy zone (usually the start/end at home).
  const segments = useMemo(() => (trip ? hideZones(trip.path, privacyZones) : []), [trip, privacyZones]);

  if (!trip) return null;

  const unit = speedUnitLabel(units);
  const scale = Math.min(1, (width - Spacing.three * 2) / 360);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        await Share.share({ message: `${trip!.name ?? 'My drive'}: ${formatDistance(units, trip!.distanceM)} with Convoy` });
      } else {
        const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
        await shareImage(uri);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={{ height: 450 * scale, alignItems: 'center' }}>
        <View style={{ transform: [{ scale }], transformOrigin: 'top' }}>
          <ShareCard
            ref={card}
            style={style}
            title={trip.name ?? formatDayOrdinal(trip.startedAt)}
            subtitle={new Date(trip.startedAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            stats={[
              { label: 'Distance', value: formatDistance(units, trip.distanceM) },
              { label: 'Time', value: formatDuration((trip.endedAt - trip.startedAt) / 1000) },
              { label: `Avg ${unit}`, value: String(Math.round(speedIn(units, averageSpeedMps(trip)))) },
            ]}
            topSpeed={{ value: String(Math.round(speedIn(units, trip.maxSpeedMps))), unit: unit.toUpperCase() }}
            segments={segments}
            watermark={watermark || !pro}
          />
        </View>
      </View>

      <View style={styles.styles}>
        {CARD_STYLES.map((s) => {
          const locked = s.premium && !pro;
          const selected = s.value === style;
          return (
            <Pressable
              key={s.value}
              onPress={() => (locked ? router.push('/paywall') : setStyle(s.value))}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.accent : theme.backgroundElement, borderColor: selected ? theme.accent : theme.border },
              ]}>
              {locked ? <MaterialCommunityIcons name="lock" size={14} color={theme.textSecondary} /> : null}
              <ThemedText type="smallBold" style={{ color: selected ? theme.accentText : theme.text }}>
                {s.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.row}>
        <ThemedText style={{ flex: 1 }}>Show &quot;Tracked with Convoy&quot;</ThemedText>
        <Switch
          value={watermark || !pro}
          disabled={!pro}
          onValueChange={setWatermark}
          accessibilityLabel="Show Convoy watermark"
        />
      </Card>
      {privacyZones.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Parts of the route inside your privacy zones are hidden.
        </ThemedText>
      ) : null}
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Button label="Share image" size="lg" loading={busy} onPress={share} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  styles: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
