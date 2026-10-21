import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LATEST_RELEASE, RELEASES, releaseDate, type Release } from '@/lib/changelog';
import { useSettings } from '@/store/settings';

/**
 * "What's new": the latest update up top, earlier ones below. Opens by itself once after an
 * update, and any time from Profile. Written in src/data/changelog.json.
 */
export default function WhatsNewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSeenRelease = useSettings((s) => s.setSeenRelease);
  const [open, setOpen] = useState<string | null>(null);

  // Opening it counts as seen, however it gets closed.
  useEffect(() => {
    if (LATEST_RELEASE) setSeenRelease(LATEST_RELEASE.id);
  }, [setSeenRelease]);

  if (!LATEST_RELEASE) return null;
  const earlier = RELEASES.slice(1);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: Spacing.three, paddingBottom: insets.bottom + Spacing.four, gap: Spacing.three }}>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="smallBold" style={{ color: theme.accent, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {releaseDate(LATEST_RELEASE.date)}
        </ThemedText>
        <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: 800 }}>{LATEST_RELEASE.title}</ThemedText>
      </View>

      <Card style={{ gap: Spacing.three }}>
        <Items release={LATEST_RELEASE} />
      </Card>

      <Button label="Got it" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />

      {earlier.length ? <SectionTitle>Earlier updates</SectionTitle> : null}
      {earlier.map((r) => {
        const expanded = open === r.id;
        return (
          <Pressable key={r.id} onPress={() => setOpen(expanded ? null : r.id)} accessibilityRole="button" accessibilityState={{ expanded }}>
            <Card style={{ gap: Spacing.three }}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: 700 }}>{r.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {releaseDate(r.date)} · {r.items.length} {r.items.length === 1 ? 'change' : 'changes'}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.textSecondary} />
              </View>
              {expanded ? <Items release={r} /> : null}
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Items({ release }: { release: Release }) {
  const theme = useTheme();
  return release.items.map((item) => (
    <View key={item.title} style={styles.item}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
        <MaterialCommunityIcons name={item.icon as 'history'} size={22} color={theme.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={{ fontWeight: 700 }}>{item.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {item.text}
        </ThemedText>
      </View>
    </View>
  ));
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  item: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
