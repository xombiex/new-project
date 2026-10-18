import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatEta, haversine, type LngLat, type Units } from '@/lib/geo';
import { openState, weekLines } from '@/lib/opening-hours';
import { fetchPlaceDetails, type PlaceDetails } from '@/lib/place-details';
import type { Place, Route } from '@/lib/places';

type Props = {
  place: Place;
  routes: Route[];
  selected: number;
  loading: boolean;
  error: string | null;
  units: Units;
  me: LngLat | null;
  showPlateCams: boolean;
  onSelect: (i: number) => void;
  onGo: () => void;
  onClose: () => void;
};

/** Apple Maps–style place sheet: what it is, how far, open now, call/website, and Go. */
export function PlaceCard({ place, routes, selected, loading, error, units, me, showPlateCams, onSelect, onGo, onClose }: Props) {
  const theme = useTheme();
  const [details, setDetails] = useState<PlaceDetails | null | undefined>(undefined);
  const [showHours, setShowHours] = useState(false);

  useEffect(() => {
    setDetails(undefined);
    setShowHours(false);
    const ctrl = new AbortController();
    fetchPlaceDetails(place.id, ctrl.signal).then(setDetails, () => setDetails(null));
    return () => ctrl.abort();
  }, [place.id]);

  const route = routes[selected];
  const away = route ? route.distanceM : me ? haversine(me, place.coord) : null;
  const status = details?.hours ? openState(details.hours) : null;
  const subtitle = [details?.category ?? place.category, away != null ? formatDistance(units, away) : null].filter(Boolean).join(' · ');

  return (
    <Animated.View entering={FadeInUp.duration(250)} style={{ alignSelf: 'stretch' }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.name} numberOfLines={2}>
            {place.name}
          </ThemedText>
          {subtitle ? (
            <ThemedText themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
          {status ? (
            <ThemedText type="smallBold" style={{ color: status.open ? theme.success : theme.danger, marginTop: 2 }}>
              {status.label}
            </ThemedText>
          ) : details === undefined ? null : details?.hoursText ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {details.hoursText}
            </ThemedText>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: theme.backgroundSelected }]}>
          <MaterialCommunityIcons name="close" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Actions, Apple style: a big Go plus square buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={onGo}
          disabled={!route}
          accessibilityRole="button"
          accessibilityLabel="Start navigation"
          style={({ pressed }) => [styles.go, { backgroundColor: theme.accent, opacity: route ? 1 : 0.5, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="car" size={22} color="#fff" />
              <ThemedText style={styles.goText}>{route ? formatEta(route.durationS) : 'Go'}</ThemedText>
            </>
          )}
        </Pressable>
        {details?.phone ? (
          <Action icon="phone" label="Call" onPress={() => void Linking.openURL(`tel:${details.phone!.replace(/[^\d+]/g, '')}`)} />
        ) : null}
        {details?.website ? <Action icon="web" label="Website" onPress={() => void WebBrowser.openBrowserAsync(details.website!)} /> : null}
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger, marginTop: Spacing.two }}>
          {error}
        </ThemedText>
      ) : null}

      {/* Route options */}
      {routes.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alts}>
          {routes.map((r, i) => {
            const on = i === selected;
            return (
              <Pressable
                key={i}
                onPress={() => onSelect(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.alt, { backgroundColor: on ? theme.accent : theme.backgroundSelected }]}>
                <ThemedText type="smallBold" style={{ color: on ? theme.accentText : theme.text }}>
                  {formatEta(r.durationS)} · {formatDistance(units, r.distanceM)}
                </ThemedText>
                {r.cameras && showPlateCams ? (
                  <ThemedText type="small" style={{ color: on ? theme.accentText : theme.textSecondary }}>
                    {r.cameras.alpr === 0 ? 'No plate cams' : `${r.cameras.alpr} plate cam${r.cameras.alpr === 1 ? '' : 's'}`}
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Details */}
      <View style={[styles.info, { backgroundColor: theme.backgroundSelected }]}>
        {route ? <Row icon="clock-outline" text={`Arrive ${new Date(Date.now() + route.durationS * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} /> : null}
        {details?.hours ? (
          <Pressable onPress={() => setShowHours((v) => !v)} accessibilityRole="button" accessibilityLabel="Opening hours">
            <Row icon="calendar-clock" text={showHours ? 'Hours' : 'Show hours'} trailing={showHours ? 'chevron-up' : 'chevron-down'} />
            {showHours
              ? weekLines(details.hours).map((l) => (
                  <View key={l.day} style={styles.hourRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {l.day}
                    </ThemedText>
                    <ThemedText type="small">{l.hours}</ThemedText>
                  </View>
                ))
              : null}
          </Pressable>
        ) : null}
        {details?.cuisine ? <Row icon="silverware-fork-knife" text={details.cuisine} /> : null}
        {details?.address || place.detail ? <Row icon="map-marker-outline" text={details?.address ?? place.detail} /> : null}
        {details?.wheelchair ? (
          <Row icon="wheelchair-accessibility" text={details.wheelchair === 'yes' ? 'Wheelchair accessible' : details.wheelchair === 'limited' ? 'Partly wheelchair accessible' : 'Not wheelchair accessible'} />
        ) : null}
        {details === undefined ? <ActivityIndicator style={{ marginVertical: Spacing.two }} color={theme.textSecondary} /> : null}
      </View>
    </Animated.View>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { backgroundColor: theme.backgroundSelected, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
      <MaterialCommunityIcons name={icon as 'phone'} size={22} color={theme.accent} />
      <ThemedText type="small" style={{ color: theme.accent, fontWeight: 700 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Row({ icon, text, trailing }: { icon: string; text: string; trailing?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon as 'phone'} size={18} color={theme.textSecondary} />
      <ThemedText type="small" style={{ flex: 1 }} numberOfLines={2}>
        {text}
      </ThemedText>
      {trailing ? <MaterialCommunityIcons name={trailing as 'phone'} size={18} color={theme.textSecondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  name: { fontSize: 24, lineHeight: 29, fontWeight: 800 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  go: { flex: 1, minHeight: 56, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  goText: { color: '#fff', fontSize: 18, fontWeight: 800 },
  action: { width: 72, minHeight: 56, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
  alts: { gap: Spacing.two, paddingTop: Spacing.three },
  alt: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md },
  info: { marginTop: Spacing.three, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingLeft: 26 },
});
