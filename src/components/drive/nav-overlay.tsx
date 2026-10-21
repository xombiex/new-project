import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, type ReactNode } from 'react';
import Animated, { cancelAnimation, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GasStop } from '@/lib/gas-along';
import { formatDistance, formatEta, type Units } from '@/lib/geo';
import { ROUTE_TAG_LABEL, type Route } from '@/lib/places';
import { laneArrow, type Lane } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import { useNavigation } from '@/store/navigation';

/** Apple Maps–style maneuver card: big arrow, distance, the street to turn onto, then the next step. */
export function NavBanner({ units, top, children }: { units: Units; top: number; /** stacked under the card (lineup, alerts) */ children?: ReactNode }) {
  const { route, progress, rerouting } = useNavigation();
  if (!route) return null;
  const index = progress?.next ?? 1;
  const step = route.steps[index] ?? route.steps.at(-1)!;
  const after = route.steps[index + 1];
  const street = step.name || step.text;

  return (
    <View style={[styles.bannerWrap, { top }]} pointerEvents="box-none">
      {/* Keyed by step so each new maneuver slides in. */}
      <Animated.View key={index} entering={FadeInDown.duration(250)} style={styles.banner} accessibilityLiveRegion="polite">
        <View style={styles.bannerMain}>
          <TurnArrow icon={step.icon} close={Boolean(progress && progress.toNextM <= 200 && !rerouting)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dist}>{rerouting ? 'Rerouting…' : progress ? formatDistance(units, progress.toNextM) : '…'}</Text>
            <Text style={styles.street} numberOfLines={2}>
              {street}
            </Text>
          </View>
        </View>
        {step.lanes && progress && progress.toNextM < 1000 ? <Lanes lanes={step.lanes} modifier={step.modifier} /> : null}
        {after && progress && progress.toNextM < 800 ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.then}>
            <Text style={styles.thenLabel}>Then</Text>
            <MaterialCommunityIcons name={after.icon as 'arrow-up'} size={20} color="#fff" />
            <Text style={styles.thenText} numberOfLines={1}>
              {after.name || after.text}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
      {children}
    </View>
  );
}

/** The maneuver arrow: pops in for each new turn and pulses once you're about 200 m away. */
function TurnArrow({ icon, close }: { icon: string; close: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (close) pulse.value = withRepeat(withSequence(withTiming(1.14, { duration: 380 }), withTiming(1, { duration: 380 })), -1);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [close, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={style}>
      <MaterialCommunityIcons name={icon as 'arrow-up'} size={56} color={close ? '#5BE37D' : '#fff'} />
    </Animated.View>
  );
}

/** Lane guidance: one arrow per lane, the ones you can use lit up. */
function Lanes({ lanes, modifier }: { lanes: Lane[]; modifier?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.lanes} accessibilityLabel={`Use lane${lanes.filter((l) => l.valid).length > 1 ? 's' : ''} ${lanes.map((l, i) => (l.valid ? i + 1 : null)).filter(Boolean).join(' and ')} of ${lanes.length}`}>
      {lanes.map((lane, i) => {
        const { angle, uturn } = laneArrow(lane, modifier);
        return (
          <View key={i} style={[styles.lane, i > 0 && styles.laneDivider]}>
            <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
              <MaterialCommunityIcons name={uturn ? 'arrow-u-left-top' : 'arrow-up-bold'} size={26} color={lane.valid ? '#fff' : 'rgba(255,255,255,0.28)'} />
            </View>
          </View>
        );
      })}
    </Animated.View>
  );
}

/** Bottom bar while navigating (Apple Maps style): time left in green, distance and arrival; change route; end. */
export function NavFooter({ units, onEnd, onRoutes, onGas, onShare }: { units: Units; onEnd?: () => void; onRoutes: () => void; onGas: () => void; onShare: () => void }) {
  const theme = useTheme();
  const { route, progress, stop, shareUrl } = useNavigation();
  if (!route) return null;
  const remainingS = progress?.remainingS ?? route.totalS;
  const remainingM = progress?.remainingM ?? route.totalM;
  return (
    <View style={styles.footer}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.eta, { color: theme.success }]} numberOfLines={1} adjustsFontSizeToFit>
          {progress?.arrived ? 'Arrived' : formatEta(remainingS)}
        </ThemedText>
        <ThemedText themeColor="textSecondary" numberOfLines={1}>
          {formatDistance(units, remainingM)} · {formatClock(Date.now() + remainingS * 1000)}
        </ThemedText>
        {/* Send someone a live link: your car on a map with your arrival time */}
        <Pressable onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel={shareUrl ? 'Sharing your ETA live. Share the link again' : 'Share your ETA'} style={styles.share}>
          {shareUrl ? <View style={[styles.liveDot, { backgroundColor: theme.success }]} /> : <MaterialCommunityIcons name="share-variant" size={14} color={theme.accent} />}
          <ThemedText type="smallBold" style={{ color: shareUrl ? theme.success : theme.accent }}>
            {shareUrl ? 'Sharing live' : 'Share ETA'}
          </ThemedText>
        </Pressable>
      </View>
      <Pressable
        onPress={onGas}
        accessibilityRole="button"
        accessibilityLabel="Gas stations ahead"
        style={({ pressed }) => [styles.roundBtn, { borderColor: theme.text, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
        <MaterialCommunityIcons name="gas-station" size={24} color={theme.text} />
      </Pressable>
      <Pressable
        onPress={onRoutes}
        accessibilityRole="button"
        accessibilityLabel="Change route"
        style={({ pressed }) => [styles.roundBtn, { borderColor: theme.text, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
        <MaterialCommunityIcons name="call-split" size={26} color={theme.text} />
      </Pressable>
      <Pressable
        onPress={() => {
          void stop();
          onEnd?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="End navigation"
        style={({ pressed }) => [styles.roundBtn, styles.endBtn, { backgroundColor: theme.danger, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
        <MaterialCommunityIcons name="close" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

/** "Gas ahead": stations near the route, soonest first. Tap one to stop there on the way. */
export function GasChooser({
  stops,
  error,
  units,
  current,
  onPick,
  onRemove,
  onClose,
}: {
  stops: GasStop[] | null;
  error: string | null;
  units: Units;
  /** the stop already added, if any */
  current: string | null;
  onPick: (s: GasStop) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ alignSelf: 'stretch', gap: Spacing.two }}>
      <View style={styles.chooserHead}>
        <ThemedText style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>Gas ahead</ThemedText>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: theme.backgroundSelected }]}>
          <MaterialCommunityIcons name="close" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      {current ? (
        <Pressable onPress={onRemove} accessibilityRole="button" style={[styles.option, { backgroundColor: theme.backgroundSelected }]}>
          <MaterialCommunityIcons name="gas-station" size={22} color={theme.accent} />
          <ThemedText style={{ flex: 1, fontWeight: 700 }} numberOfLines={1}>
            Stopping at {current}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            Remove
          </ThemedText>
        </Pressable>
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : !stops ? (
        <ActivityIndicator color={theme.accent} style={{ marginVertical: Spacing.three }} />
      ) : stops.length === 0 ? (
        <ThemedText themeColor="textSecondary">No gas stations near the road in the next 25 miles.</ThemedText>
      ) : (
        <ScrollView style={{ maxHeight: current ? 160 : 230 }} contentContainerStyle={{ gap: Spacing.two }} showsVerticalScrollIndicator={false}>
          {stops.map((s) => (
            <Pressable
              key={`${s.name}-${s.coord.join()}`}
              onPress={() => onPick(s)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
              <MaterialCommunityIcons name="gas-station" size={22} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: 800 }} numberOfLines={1}>
                  {s.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  In {formatDistance(units, s.aheadM)} · {s.offRouteM < 60 ? 'on your route' : `${formatDistance(units, s.offRouteM)} off route`}
                </ThemedText>
              </View>
              <View style={[styles.goPill, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>
                  Add stop
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

/** Mid-drive route picker: the same kinds of options as before you left, from where you are now. */
export function RouteChooser({
  routes,
  error,
  units,
  onPick,
  onClose,
}: {
  routes: Route[] | null;
  error: string | null;
  units: Units;
  onPick: (r: Route) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ alignSelf: 'stretch', gap: Spacing.two }}>
      <View style={styles.chooserHead}>
        <ThemedText style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>Change route</ThemedText>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[styles.close, { backgroundColor: theme.backgroundSelected }]}>
          <MaterialCommunityIcons name="close" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : !routes ? (
        <ActivityIndicator color={theme.accent} style={{ marginVertical: Spacing.three }} />
      ) : (
        routes.map((r, i) => (
          <Pressable
            key={i}
            onPress={() => onPick(r)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.option, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 800 }}>{formatEta(r.durationS)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[r.tags?.length ? r.tags.map((t) => ROUTE_TAG_LABEL[t]).join(' · ') : 'Alternative', formatDistance(units, r.distanceM), r.turns != null ? `${r.turns} turns` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
            <View style={[styles.goPill, { backgroundColor: theme.accent }]}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                Go
              </ThemedText>
            </View>
          </Pressable>
        ))
      )}
    </Animated.View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 };

const styles = StyleSheet.create({
  bannerWrap: { position: 'absolute', left: Spacing.two, right: Spacing.two, gap: Spacing.two },
  banner: { backgroundColor: 'rgba(22,24,28,0.97)', borderRadius: 24, overflow: 'hidden', ...shadow },
  bannerMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  dist: { color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '800' },
  street: { color: '#fff', fontSize: 21, lineHeight: 25, fontWeight: '700' },
  lanes: { flexDirection: 'row', alignSelf: 'center', marginBottom: Spacing.two, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' },
  lane: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  laneDivider: { borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.35)', borderStyle: 'dashed' },
  then: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, backgroundColor: 'rgba(255,255,255,0.08)' },
  thenLabel: { color: '#B0B5BD', fontSize: 14, fontWeight: '700' },
  thenText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: Spacing.two + 2 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, alignSelf: 'flex-start' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  eta: { fontSize: 30, lineHeight: 36, fontWeight: 800, fontVariant: ['tabular-nums'] },
  roundBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  endBtn: { borderWidth: 0 },
  chooserHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md },
  goPill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
});
