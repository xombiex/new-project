import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Glass } from '@/components/glass';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, type Units } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import { useNavigation } from '@/store/navigation';

/** Big, glanceable maneuver banner shown at the top of the Drive tab while navigating. */
export function NavBanner({ units, top }: { units: Units; top: number }) {
  const theme = useTheme();
  const { route, progress, rerouting } = useNavigation();
  if (!route) return null;
  const step = route.steps[progress?.next ?? 1] ?? route.steps.at(-1)!;
  const after = route.steps[(progress?.next ?? 1) + 1];

  return (
    <View style={[styles.bannerWrap, { top }]} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: theme.accent }]} accessibilityLiveRegion="polite">
        <MaterialCommunityIcons name={step.icon as 'arrow-up'} size={48} color="#fff" />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.dist}>
            {rerouting ? 'Rerouting…' : progress ? formatDistance(units, progress.toNextM) : '…'}
          </ThemedText>
          <ThemedText style={styles.text} numberOfLines={2}>
            {step.text}
          </ThemedText>
        </View>
      </View>
      {after && progress && progress.toNextM < 600 ? (
        <Glass style={styles.then}>
          <ThemedText type="smallBold">Then</ThemedText>
          <MaterialCommunityIcons name={after.icon as 'arrow-up'} size={18} color={theme.text} />
          <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
            {after.name || after.text}
          </ThemedText>
        </Glass>
      ) : null}
    </View>
  );
}

/** ETA strip + controls; replaces the trip controls while navigating. */
export function NavFooter({ units, onEnd }: { units: Units; onEnd?: () => void }) {
  const theme = useTheme();
  const { route, progress, muted, toggleMute, stop } = useNavigation();
  if (!route) return null;
  const remainingS = progress?.remainingS ?? route.totalS;
  const remainingM = progress?.remainingM ?? route.totalM;
  return (
    <View style={styles.footer}>
      <Pressable onPress={toggleMute} accessibilityRole="button" accessibilityLabel={muted ? 'Unmute voice' : 'Mute voice'} style={[styles.round, { backgroundColor: theme.backgroundSelected }]}>
        <MaterialCommunityIcons name={muted ? 'volume-off' : 'volume-high'} size={24} color={theme.text} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <ThemedText style={styles.eta}>{progress?.arrived ? 'Arrived' : formatClock(Date.now() + remainingS * 1000)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDuration(remainingS)} · {formatDistance(units, remainingM)}
        </ThemedText>
      </View>
      <Pressable onPress={() => {
          void stop();
          onEnd?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="End navigation" style={[styles.round, { backgroundColor: theme.danger }]}>
        <MaterialCommunityIcons name="close" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { position: 'absolute', left: Spacing.three, right: Spacing.three, gap: Spacing.two },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  dist: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: 800 },
  text: { color: '#fff', fontSize: 18, lineHeight: 23, fontWeight: 600 },
  then: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    maxWidth: '80%',
  },
  footer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.three },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  eta: { fontSize: 26, lineHeight: 30, fontWeight: 800, fontVariant: ['tabular-nums'] },
});
