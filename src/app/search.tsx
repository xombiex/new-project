import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { pinLook, placeLook } from '@/components/place-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, haversine, type LngLat } from '@/lib/geo';
import { searchPlaces, type Place } from '@/lib/places';
import { formatAgo } from '@/lib/time';
import { listen, voiceAvailable } from '@/lib/voice';
import { useDrive } from '@/store/drive';
import { useNav } from '@/store/nav';
import { usePlaces, type Pin, type PinKind } from '@/store/places';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

const PIN_PROMPT: Record<PinKind, string> = { home: 'Search for your home address', work: 'Search for your work address', other: 'Search for a place to pin' };

/** Search as a sheet over the map (Apple Maps style): your places, suggestions, and results. */
export default function SearchScreen() {
  const { purpose } = useLocalSearchParams<{ purpose?: 'route' | 'drive' }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const units = useSettings((s) => s.units);
  const router = useRouter();
  const last = useTrips((s) => s.lastSample);
  const lastTrip = useTrips((s) => s.history[0]);
  const recording = useTrips((s) => Boolean(s.active));
  const { pins, recents, setPin, unpin, addRecent, removeRecent } = usePlaces();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Picking a result pins it (Home / Work / favourite) instead of routing there. */
  const [pinning, setPinning] = useState<PinKind | null>(null);
  const [listening, setListening] = useState(false);
  const stopVoice = useRef<(() => void) | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const near: LngLat | undefined = last ? [last.lng, last.lat] : undefined;
  const canVoice = useMemo(voiceAvailable, []);
  // Opened straight from a link or a refresh there's nothing underneath to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

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

  useEffect(() => () => stopVoice.current?.(), []);

  async function toggleVoice() {
    if (listening) {
      stopVoice.current?.();
      return;
    }
    setError(null);
    setListening(true);
    stopVoice.current = await listen({
      onText: (text) => setQuery(text),
      onEnd: () => {
        setListening(false);
        stopVoice.current = null;
      },
      onError: setError,
    });
  }

  /** Where the car was left: the end of your last drive (if you're not driving now). */
  const parked = useMemo<Place | null>(() => {
    const end = lastTrip?.path.at(-1);
    if (!end || recording || Date.now() - lastTrip.endedAt > 3 * 86_400_000) return null;
    const home = pins.find((p) => p.kind === 'home');
    const nearHome = home && haversine(home.place.coord, end) < 200;
    return { id: 'parked-car', name: 'Parked Car', detail: nearHome ? 'Near Home' : `Parked ${formatAgo(lastTrip.endedAt)}`, coord: end };
  }, [lastTrip, recording, pins]);

  async function go(place: Place) {
    if (pinning) {
      setPin(pinning, place);
      setPinning(null);
      setQuery('');
      return;
    }
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
    if (place.id !== 'parked-car') addRecent(place);
    close();
  }

  function startPinning(kind: PinKind) {
    setPinning(kind);
    setQuery('');
    input.current?.focus();
  }

  function pinOptions(pin: Pin) {
    const buttons = [
      ...(pin.kind !== 'other' ? [{ text: `Change ${pin.label} address`, onPress: () => startPinning(pin.kind) }] : []),
      { text: 'Remove', style: 'destructive' as const, onPress: () => unpin(pin.place.id) },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(pin.label, pin.place.detail || pin.place.name, buttons);
  }

  const away = (coord: LngLat) => {
    if (!near) return '';
    const m = haversine(near, coord);
    return m < 200 ? 'Close by' : formatDistance(units, m);
  };

  const hasHome = pins.some((p) => p.kind === 'home');
  const hasWork = pins.some((p) => p.kind === 'work');
  const showLists = query.trim().length < 3;
  const topGap = Math.max(insets.top + 56, Math.round(height * 0.2));

  return (
    <View style={{ flex: 1 }}>
      {/* The map stays visible above the sheet; tap it to close. */}
      <Pressable style={{ height: topGap, backgroundColor: 'rgba(0,0,0,0.12)' }} onPress={() => close()} accessibilityLabel="Close search" />
      <Glass style={[styles.sheet, { paddingBottom: insets.bottom }]} intensity={60}>
        <View style={[styles.grabber, { backgroundColor: theme.textSecondary }]} />
        <View style={styles.searchRow}>
          <View style={[styles.field, { backgroundColor: theme.backgroundSelected }]}>
            <MaterialCommunityIcons name="magnify" size={22} color={theme.textSecondary} />
            <TextInput
              ref={input}
              value={query}
              onChangeText={setQuery}
              placeholder={listening ? 'Listening…' : pinning ? PIN_PROMPT[pinning] : purpose === 'drive' ? 'Group destination' : 'Search Convoy Maps'}
              placeholderTextColor={listening ? theme.accent : theme.textSecondary}
              autoFocus={Platform.OS === 'web' || (pins.length === 0 && recents.length === 0 && !parked)}
              returnKeyType="search"
              autoCorrect={false}
              style={[styles.input, { color: theme.text }]}
              accessibilityLabel="Search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <MaterialCommunityIcons name="close-circle" size={20} color={theme.textSecondary} />
              </Pressable>
            ) : null}
            {canVoice ? <MicButton listening={listening} onPress={() => void toggleVoice()} /> : null}
          </View>
          <Pressable onPress={() => (pinning ? setPinning(null) : close())} hitSlop={8} accessibilityRole="button">
            <ThemedText style={{ color: theme.accent, fontWeight: 600 }}>Cancel</ThemedText>
          </Pressable>
        </View>
        {error ? (
          <ThemedText type="small" style={{ color: theme.danger, paddingHorizontal: Spacing.three }}>
            {error}
          </ThemedText>
        ) : null}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {showLists ? (
            <>
              {!pinning && (parked || recents.length) ? (
                <>
                  <ThemedText style={styles.section}>Suggestions</ThemedText>
                  <View style={[styles.group, { backgroundColor: theme.backgroundSelected }]}>
                    {parked ? (
                      <Row icon="car" color={theme.accent} title={parked.name} subtitle={[parked.detail, away(parked.coord)].filter(Boolean).join(' · ')} onPress={() => void go(parked)} />
                    ) : null}
                    {recents.slice(0, parked ? 4 : 5).map((r, i) => (
                      <Row
                        key={r.id}
                        divider={i > 0 || Boolean(parked)}
                        icon="clock-outline"
                        color="#8E8E93"
                        title={r.name}
                        subtitle={[away(r.coord), r.detail].filter(Boolean).join(' · ')}
                        onPress={() => void go(r)}
                        onLongPress={() =>
                          Alert.alert(r.name, 'Remove from recents?', [
                            { text: 'Remove', style: 'destructive', onPress: () => removeRecent(r.id) },
                            { text: 'Cancel', style: 'cancel' },
                          ])
                        }
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {!pinning ? (
                <>
                  <ThemedText style={styles.section}>Places</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pins} keyboardShouldPersistTaps="handled">
                    {pins.map((p) => {
                      const look = pinLook(p);
                      return (
                        <Circle
                          key={p.place.id}
                          icon={look.icon}
                          color={look.color}
                          title={p.kind === 'other' ? p.label : p.place.name}
                          subtitle={away(p.place.coord) || (p.kind === 'other' ? '' : p.label)}
                          onPress={() => void go(p.place)}
                          onLongPress={() => pinOptions(p)}
                        />
                      );
                    })}
                    {!hasHome ? <Circle icon="home" color="#4FC3F7" title="Home" subtitle="Add" faded onPress={() => startPinning('home')} /> : null}
                    {!hasWork ? <Circle icon="briefcase" color="#A47A5B" title="Work" subtitle="Add" faded onPress={() => startPinning('work')} /> : null}
                    <Circle icon="plus" color="#8E8E93" title="Add" subtitle="a place" faded onPress={() => startPinning('other')} />
                  </ScrollView>
                  {pins.length ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Press and hold a place to change or remove it. You can also pin any place from its card on the map.
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              {loading ? <ActivityIndicator color={theme.accent} style={{ marginVertical: Spacing.two }} /> : null}
              {results.length ? (
                <View style={[styles.group, { backgroundColor: theme.backgroundSelected }]}>
                  {results.map((item, i) => {
                    const look = placeLook(item.category);
                    return (
                      <Row
                        key={item.id}
                        divider={i > 0}
                        icon={pinning ? (pinning === 'home' ? 'home' : pinning === 'work' ? 'briefcase' : 'pin') : look.icon}
                        color={pinning ? theme.accent : look.color}
                        title={item.name}
                        subtitle={[item.category, near ? formatDistance(units, haversine(near, item.coord)) : null, item.detail].filter(Boolean).join(' · ')}
                        onPress={() => void go(item)}
                      />
                    );
                  })}
                </View>
              ) : !loading ? (
                <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.three }}>
                  No places found
                </ThemedText>
              ) : null}
            </>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
            Search data © OpenStreetMap contributors
          </ThemedText>
        </ScrollView>
      </Glass>
    </View>
  );
}

function MicButton({ listening, onPress }: { listening: boolean; onPress: () => void }) {
  const theme = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = listening ? withRepeat(withTiming(1.35, { duration: 600 }), -1, true) : withTiming(1);
  }, [listening, pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'} style={styles.mic}>
      {listening ? <Animated.View style={[StyleSheet.absoluteFill, styles.micRing, { backgroundColor: theme.danger }, ring]} /> : null}
      <MaterialCommunityIcons name="microphone" size={22} color={listening ? theme.danger : theme.textSecondary} />
    </Pressable>
  );
}

function Row({
  icon,
  color,
  title,
  subtitle,
  divider,
  onPress,
  onLongPress,
}: {
  icon: string;
  color: string;
  title: string;
  subtitle?: string;
  divider?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={[styles.rowIcon, { backgroundColor: color }]}>
        <MaterialCommunityIcons name={icon as 'car'} size={20} color="#fff" />
      </View>
      <View style={[styles.rowText, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
        <ThemedText numberOfLines={1} style={{ fontWeight: 700 }}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function Circle({
  icon,
  color,
  title,
  subtitle,
  faded,
  onPress,
  onLongPress,
}: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  faded?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
        style={({ pressed }) => [styles.circleWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <View style={[styles.circle, { backgroundColor: color, opacity: faded ? 0.55 : 1 }]}>
          <MaterialCommunityIcons name={icon as 'home'} size={34} color="#fff" />
        </View>
        <ThemedText numberOfLines={1} style={styles.circleTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ textAlign: 'center' }}>
          {subtitle}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomWidth: 0 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, opacity: 0.4, marginTop: Spacing.two },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 46, borderRadius: Radius.lg, paddingHorizontal: Spacing.three },
  input: { flex: 1, minWidth: 0, fontSize: 17, paddingVertical: Spacing.two, outlineStyle: 'none' } as never,
  mic: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  micRing: { borderRadius: 16, opacity: 0.3 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  section: { fontSize: 22, lineHeight: 28, fontWeight: 800, marginTop: Spacing.two },
  group: { borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingLeft: Spacing.three },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, paddingVertical: Spacing.three, paddingRight: Spacing.three },
  pins: { gap: Spacing.three, paddingVertical: Spacing.one },
  circleWrap: { width: 84, alignItems: 'center' },
  circle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  circleTitle: { fontWeight: 700, fontSize: 14, textAlign: 'center', alignSelf: 'stretch' },
});
