import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatEta, speedIn, speedUnitLabel, type Units } from '@/lib/geo';
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

/** Bottom bar while navigating: arrival time, minutes and distance left, and End. */
export function NavFooter({ units, onEnd }: { units: Units; onEnd?: () => void }) {
  const theme = useTheme();
  const { route, progress, muted, toggleMute, stop } = useNavigation();
  if (!route) return null;
  const remainingS = progress?.remainingS ?? route.totalS;
  const remainingM = progress?.remainingM ?? route.totalM;
  const cols = [
    // Like Apple Maps: "9:22" with no AM/PM so the three numbers fit side by side.
    { value: progress?.arrived ? 'Here' : formatClock(Date.now() + remainingS * 1000).replace(/\s?[AP]\.?M\.?$/i, ''), label: 'arrival' },
    { value: formatEta(remainingS), label: 'left' },
    { value: formatDistance(units, remainingM), label: 'to go' },
  ];
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={toggleMute}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute voice' : 'Mute voice'}
        style={[styles.mute, { backgroundColor: theme.backgroundSelected }]}>
        <MaterialCommunityIcons name={muted ? 'volume-off' : 'volume-high'} size={22} color={theme.text} />
      </Pressable>
      <View style={styles.cols}>
        {cols.map((c) => (
          <View key={c.label} style={{ alignItems: 'center', flex: 1 }}>
            <ThemedText style={styles.colValue} numberOfLines={1} adjustsFontSizeToFit>
              {c.value}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {c.label}
            </ThemedText>
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => {
          void stop();
          onEnd?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="End navigation"
        style={({ pressed }) => [styles.end, { backgroundColor: theme.danger, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
        <Text style={styles.endText}>End</Text>
      </Pressable>
    </View>
  );
}

/** Current speed in a white bubble (Apple Maps style), shown beside the speed limit while navigating. */
export function SpeedBubble({ mps, units, speeding }: { mps: number | null; units: Units; speeding: boolean }) {
  const value = mps == null ? '--' : String(Math.round(speedIn(units, mps)));
  return (
    <View style={[styles.bubble, speeding && { backgroundColor: '#FF3B30' }]} accessibilityLabel={`${value} ${speedUnitLabel(units)}`}>
      <Text style={[styles.bubbleValue, speeding && { color: '#fff' }]}>{value}</Text>
      <Text style={[styles.bubbleUnit, speeding && { color: '#fff' }]}>{speedUnitLabel(units)}</Text>
    </View>
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
  footer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: Spacing.two },
  mute: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cols: { flex: 1, flexDirection: 'row' },
  colValue: { fontSize: 21, lineHeight: 25, fontWeight: 800, fontVariant: ['tabular-nums'] },
  end: { paddingHorizontal: Spacing.four, height: 48, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  endText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  bubble: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  bubbleValue: { color: '#111', fontSize: 24, lineHeight: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  bubbleUnit: { color: '#555', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
});
