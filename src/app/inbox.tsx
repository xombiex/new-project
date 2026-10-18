import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useInbox } from '@/store/inbox';

function when(iso: string) {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Messages from the Convoy team. Opening the inbox marks everything read. */
export default function InboxScreen() {
  const theme = useTheme();
  const { messages, loaded, load, markAllRead } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  // Remember what was unread when the screen opened, so those keep their dot while you read.
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set(messages.filter((m) => !m.read_at).map((m) => m.id)));

  useEffect(() => {
    void load().then(() => setFreshIds(new Set(useInbox.getState().messages.filter((m) => !m.read_at).map((m) => m.id))));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (loaded) void markAllRead();
    }, [loaded, markAllRead])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    await markAllRead();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
      {loaded && messages.length === 0 ? (
        <EmptyState title="No messages yet" body="News and updates from the Convoy team show up here." />
      ) : null}
      {messages.map((m, i) => (
        <Animated.View key={m.id} entering={FadeInUp.delay(Math.min(i, 8) * 40).duration(250)}>
          <Card style={{ gap: Spacing.one }}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: theme.accent }]}>
                <MaterialCommunityIcons name="bullhorn-variant" size={16} color="#fff" />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                Convoy team
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {when(m.created_at)}
              </ThemedText>
              {freshIds.has(m.id) ? <View style={[styles.dot, { backgroundColor: theme.accent }]} accessibilityLabel="New" /> : null}
            </View>
            <ThemedText style={{ fontWeight: 800, fontSize: 17 }}>{m.title}</ThemedText>
            <ThemedText selectable>{m.body}</ThemedText>
          </Card>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  icon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
