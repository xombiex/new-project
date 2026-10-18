import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatEta, type Units } from '@/lib/geo';
import { ROUTE_TAG_LABEL, type Route } from '@/lib/places';
import { formatClock } from '@/lib/time';
import { useNavigation } from '@/store/navigation';

/** Apple Maps–style maneuver card: big arrow, distance, the street to turn onto, then the next step. */
export function NavBanner({ units, top }: { units: Units; top: number }) {
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
          <MaterialCommunityIcons name={step.icon as 'arrow-up'} size={56} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.dist}>{rerouting ? 'Rerouting…' : progress ? formatDistance(units, progress.toNextM) : '…'}</Text>
            <Text style={styles.street} numberOfLines={2}>
              {street}
            </Text>
          </View>
        </View>
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
    </View>
  );
}

/** Bottom bar while navigating (Apple Maps style): time left in green, distance and arrival; change route; end. */
export function NavFooter({ units, onEnd, onRoutes }: { units: Units; onEnd?: () => void; onRoutes: () => void }) {
  const theme = useTheme();
  const { route, progress, stop } = useNavigation();
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
      </View>
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
  bannerWrap: { position: 'absolute', left: Spacing.two, right: Spacing.two },
  banner: { backgroundColor: 'rgba(22,24,28,0.97)', borderRadius: 24, overflow: 'hidden', ...shadow },
  bannerMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  dist: { color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '800' },
  street: { color: '#fff', fontSize: 21, lineHeight: 25, fontWeight: '700' },
  then: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, backgroundColor: 'rgba(255,255,255,0.08)' },
  thenLabel: { color: '#B0B5BD', fontSize: 14, fontWeight: '700' },
  thenText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: Spacing.three },
  eta: { fontSize: 30, lineHeight: 36, fontWeight: 800, fontVariant: ['tabular-nums'] },
  roundBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  endBtn: { borderWidth: 0 },
  chooserHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md },
  goPill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
});
