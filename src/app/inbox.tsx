import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { DrivingLock } from '@/components/social/driving-lock';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, ErrorState, LoadingRows } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { postedAgo } from '@/lib/feed';
import { useInbox, type InboxMessage } from '@/store/inbox';
import { useDrivingLock } from '@/store/social';

const LOOK: Record<InboxMessage['kind'], { icon: 'bullhorn-variant' | 'heart' | 'comment'; from: string }> = {
  announcement: { icon: 'bullhorn-variant', from: 'Convoy team' },
  like: { icon: 'heart', from: 'Like' },
  comment: { icon: 'comment', from: 'Comment' },
};

/** News from the Convoy team, and likes and comments on your drives. Opening it marks everything read. */
export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const locked = useDrivingLock();
  const { messages, loaded, error, hasMore, loadingMore, load, loadMore, markAllRead } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  // Remember what was unread when the screen opened, so those keep their dot while you read.
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set(messages.filter((m) => !m.read_at).map((m) => m.id)));

  useEffect(() => {
    void load().then(() => setFreshIds(new Set(useInbox.getState().messages.filter((m) => !m.read_at).map((m) => m.id))));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (loaded && !locked) void markAllRead();
    }, [loaded, locked, markAllRead])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    await markAllRead();
    setRefreshing(false);
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
      <View style={styles.column}>
        {locked ? (
          <DrivingLock what="Your inbox" />
        ) : !loaded ? (
          <LoadingRows count={3} avatar={false} />
        ) : error && messages.length === 0 ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : messages.length === 0 ? (
          <EmptyState icon="inbox-outline" title="Nothing yet" body="Likes and comments on drives you share show up here, along with news from the Convoy team." />
        ) : (
          <>
            {messages.map((m) => {
              const look = LOOK[m.kind] ?? LOOK.announcement;
              const opens = m.kind !== 'announcement' && m.activity_id;
              const card = (
                <Card style={{ gap: Spacing.one }}>
                  <View style={styles.head}>
                    <View style={[styles.icon, { backgroundColor: theme.accent }]}>
                      <MaterialCommunityIcons name={look.icon} size={16} color="#fff" />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                      {look.from}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {postedAgo(m.created_at)}
                    </ThemedText>
                    {freshIds.has(m.id) ? <View style={[styles.dot, { backgroundColor: theme.accent }]} accessibilityLabel="New" /> : null}
                  </View>
                  <ThemedText type="lead">{m.title}</ThemedText>
                  <ThemedText selectable={!opens} themeColor={opens ? 'textSecondary' : 'text'} numberOfLines={opens ? 2 : undefined}>
                    {m.body}
                  </ThemedText>
                </Card>
              );
              return opens ? (
                <Pressable key={m.id} onPress={() => router.push({ pathname: '/activity/[id]', params: { id: m.activity_id! } })} accessibilityRole="button" accessibilityLabel={`${m.title}. Open the drive`} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                  {card}
                </Pressable>
              ) : (
                <View key={m.id}>{card}</View>
              );
            })}
            {hasMore ? <Button label="Show older" variant="secondary" onPress={() => void loadMore()} loading={loadingMore} /> : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  icon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
