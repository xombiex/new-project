import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CALL_SHOW_MS, QUICK_CALLS, quickCall } from '@/lib/quick-calls';
import { useDrive } from '@/store/drive';

/** Big buttons, one tap, sheet closes: "Need gas", "Cop ahead"… sent to the whole convoy. */
export function QuickCallSheet({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={[styles.grabber, { backgroundColor: theme.textSecondary }]} />
        <ThemedText style={{ fontSize: 20, fontWeight: 800 }}>Tell the convoy</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Everyone sees it and hears it read out. Passengers, you do the tapping.
        </ThemedText>
        <View style={styles.grid}>
          {QUICK_CALLS.map((c) => (
            <Pressable
              key={c.kind}
              onPress={() => {
                const res = useDrive.getState().sendCall(c.kind);
                if (res === 'sent') onClose();
                else setProblem(res === 'wait' ? 'One moment: you just sent one.' : 'Not connected to the convoy right now.');
              }}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              style={({ pressed }) => [styles.tile, { backgroundColor: c.color, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
              <MaterialCommunityIcons name={c.icon as 'alert'} size={28} color="#fff" />
              <Text style={styles.tileText}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        {problem ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {problem}
          </ThemedText>
        ) : null}
      </View>
    </Modal>
  );
}

/** Round megaphone button that opens the sheet. */
export function QuickCallButton({ style }: { style?: object }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Quick call to the convoy"
        style={({ pressed }) => [styles.fab, { backgroundColor: theme.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }, style]}>
        <MaterialCommunityIcons name="bullhorn" size={26} color="#fff" />
      </Pressable>
      {open ? <QuickCallSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** All the calls as a row of chips (Convoy tab). */
export function QuickCallRow() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
      {QUICK_CALLS.map((c) => (
        <Pressable
          key={c.kind}
          onPress={() => useDrive.getState().sendCall(c.kind)}
          accessibilityRole="button"
          accessibilityLabel={`Tell the convoy: ${c.label}`}
          style={({ pressed }) => [styles.chip, { backgroundColor: c.color, opacity: pressed ? 0.8 : 1 }]}>
          <MaterialCommunityIcons name={c.icon as 'alert'} size={18} color="#fff" />
          <Text style={styles.chipText}>{c.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** The latest calls from the convoy, each for a few seconds. */
export function QuickCallBanner() {
  const calls = useDrive((s) => s.calls);
  const [now, setNow] = useState(Date.now());
  const visible = calls.filter((c) => now - c.at < CALL_SHOW_MS).slice(-2);
  useEffect(() => {
    if (!calls.length) return;
    const latest = calls[calls.length - 1].at;
    setNow(Date.now());
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, latest + CALL_SHOW_MS - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [calls]);
  if (!visible.length) return null;
  return (
    <View style={{ gap: Spacing.one + 2, alignSelf: 'stretch', alignItems: 'center' }} pointerEvents="none">
      {visible.map((c) => {
        const call = quickCall(c.kind)!;
        return (
          <Animated.View key={c.id} entering={FadeInDown.springify().damping(14)} exiting={FadeOutUp.duration(200)} style={[styles.banner, { backgroundColor: call.color }]}>
            <MaterialCommunityIcons name={call.icon as 'alert'} size={20} color="#fff" />
            <Text style={styles.bannerText} numberOfLines={1}>
              {c.name}: {call.label}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.three, gap: Spacing.two },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, opacity: 0.4, marginBottom: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 72, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tileText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#fff',
    maxWidth: '94%',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  chipText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bannerText: { color: '#fff', fontWeight: '800', fontSize: 16, flexShrink: 1 },
});
