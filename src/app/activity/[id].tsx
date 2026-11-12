import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionMenu, type MenuAction } from '@/components/social/action-menu';
import { ActivityCard } from '@/components/social/activity-card';
import { DrivingLock } from '@/components/social/driving-lock';
import { useActivityMenu } from '@/components/social/use-activity-menu';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState, ErrorState, IconButton, LoadingRows, Notice, Skeleton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { useTheme } from '@/hooks/use-theme';
import { postedAgo } from '@/lib/feed';
import { notify } from '@/lib/notifications';
import { COMMENT_MAX, feed, type Activity, type Comment } from '@/services/feed';
import { useAuth } from '@/store/auth';
import { useFriends } from '@/store/friends';
import { useSettings } from '@/store/settings';
import { useDrivingLock, useSocial } from '@/store/social';

/** A comment that's on screen before the server has confirmed it. */
type Shown = Comment & { pending?: boolean };

/** One shared drive with its comments. Reached from a feed card, the inbox or a notification. */
export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuth((s) => s.profile);
  const units = useSettings((s) => s.units);
  const locked = useDrivingLock();
  const toggleLike = useSocial((s) => s.toggleLike);
  const commentsChanged = useSocial((s) => s.commentsChanged);
  const block = useFriends((s) => s.block);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [commentMenu, setCommentMenu] = useState<Shown | null>(null);

  const comments = usePagedList<Shown>(`comments:${id}`, (cursor) => feed.comments(String(id), cursor), Boolean(id) && !locked);
  const menu = useActivityMenu(() => router.back());

  const load = useCallback(async () => {
    if (!id) return;
    const res = await feed.get(String(id));
    setLoading(false);
    if (res.ok) {
      setActivity(res.data);
      setLoadError(null);
    } else setLoadError(res.error.message);
  }, [id]);

  useEffect(() => {
    if (!locked) void load();
  }, [load, locked]);

  async function send() {
    const body = draft.trim();
    if (!activity || !profile || !body) return;
    const temp: Shown = { id: `pending-${Date.now()}`, activityId: activity.id, author: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_color: profile.avatar_color }, body, createdAt: new Date().toISOString(), pending: true };
    // On screen at once; swapped for the saved one, or taken back with the text restored.
    comments.setItems((items) => [temp, ...items]);
    setDraft('');
    setSendError(null);
    const res = await feed.addComment(activity.id, body);
    if (res.ok) {
      comments.setItems((items) => items.map((c) => (c.id === temp.id ? res.data : c)));
      commentsChanged(activity, 1);
      void notify({ type: 'activity_comment', activity_id: activity.id });
    } else {
      comments.setItems((items) => items.filter((c) => c.id !== temp.id));
      setDraft(body);
      setSendError(res.error.message);
    }
  }

  async function remove(comment: Shown) {
    if (!activity) return;
    const before = comments.items;
    comments.setItems((items) => items.filter((c) => c.id !== comment.id));
    const res = await feed.deleteComment(comment.id);
    if (res.ok) commentsChanged(activity, -1);
    else {
      comments.setItems(() => before);
      Alert.alert("Couldn't delete that comment", res.error.message);
    }
  }

  const commentActions: MenuAction[] = !commentMenu || !activity
    ? []
    : [
        ...(commentMenu.author.id === profile?.id || activity.author.id === profile?.id
          ? [{ icon: 'trash-can-outline' as const, label: 'Delete comment', destructive: true, onPress: () => void remove(commentMenu) }]
          : []),
        ...(commentMenu.author.id !== profile?.id
          ? [
              { icon: 'flag-outline' as const, label: 'Report comment', onPress: () => menu.report({ kind: 'comment', id: commentMenu.id, userId: commentMenu.author.id, name: commentMenu.author.display_name }) },
              {
                icon: 'account-cancel-outline' as const,
                label: `Block ${commentMenu.author.display_name}`,
                hint: "You stop seeing each other's drives and comments. They aren't told.",
                destructive: true,
                onPress: async () => {
                  const err = await block(commentMenu.author.id);
                  if (err) Alert.alert("Couldn't block", err);
                  else comments.setItems((items) => items.filter((c) => c.author.id !== commentMenu.author.id));
                },
              },
            ]
          : []),
      ];

  // Oldest at the top, newest by the box you type in.
  const ordered = [...comments.items].reverse();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: 'Drive' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={comments.status === 'refreshing'}
            onRefresh={() => {
              void load();
              void comments.refresh();
            }}
          />
        }>
        <View style={styles.column}>
          {locked ? (
            <DrivingLock what="This drive" />
          ) : loading ? (
            <Card style={{ gap: Spacing.three }}>
              <Skeleton height={44} width="60%" />
              <Skeleton height={150} />
              <Skeleton height={34} />
            </Card>
          ) : !activity ? (
            <ErrorState title="Can't show this drive" message={loadError ?? "It isn't shared any more."} onRetry={() => void load()} />
          ) : (
            <>
              <ActivityCard
                activity={activity}
                units={units}
                onLike={async () => {
                  const err = await toggleLike(activity);
                  if (err) Alert.alert("Couldn't save your like", err);
                }}
                onMenu={() => menu.open(activity)}
              />

              <ThemedText type="heading" accessibilityRole="header">
                Comments
              </ThemedText>
              {comments.status === 'loading' ? (
                <LoadingRows count={2} />
              ) : comments.status === 'error' ? (
                <ErrorState title="Couldn't load comments" message={comments.error ?? ''} onRetry={() => void comments.retry()} />
              ) : (
                <>
                  {comments.hasMore ? <Button label="Show earlier comments" variant="ghost" onPress={() => void comments.loadMore()} loading={comments.status === 'more'} /> : null}
                  {ordered.length === 0 ? <EmptyState icon="comment-outline" title="No comments yet" body={activity.author.id === profile?.id ? 'When someone says something about this drive, it shows up here.' : `Tell ${activity.author.display_name} what you think of the road.`} /> : null}
                  {ordered.map((c) => (
                    <View key={c.id} style={[styles.comment, { opacity: c.pending ? 0.55 : 1 }]}>
                      <Avatar name={c.author.display_name} color={c.author.avatar_color} size={36} />
                      <View style={[styles.bubble, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                        <View style={styles.commentHead}>
                          <ThemedText type="smallBold" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {c.author.display_name}
                          </ThemedText>
                          <ThemedText type="caption" themeColor="textSecondary">
                            {c.pending ? 'Sending…' : postedAgo(c.createdAt)}
                          </ThemedText>
                        </View>
                        <ThemedText selectable>{c.body}</ThemedText>
                      </View>
                      {c.pending ? <View style={{ width: 40 }} /> : <IconButton icon="dots-horizontal" label={`Options for ${c.author.display_name}'s comment`} size={40} color={theme.textSecondary} onPress={() => setCommentMenu(c)} />}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {activity && !locked && profile ? (
        <View style={[styles.composer, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
          <View style={styles.column}>
            {sendError ? <Notice tone="danger">{sendError}</Notice> : null}
            <View style={styles.composerRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment"
                placeholderTextColor={theme.textSecondary}
                maxLength={COMMENT_MAX}
                multiline
                accessibilityLabel="Add a comment"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
              />
              <IconButton icon="send" label="Post comment" tone="accent" onPress={() => void send()} disabled={!draft.trim()} />
            </View>
            {draft.length > COMMENT_MAX - 60 ? (
              <ThemedText type="caption" themeColor="textSecondary" style={{ textAlign: 'right' }}>
                {COMMENT_MAX - draft.length} left
              </ThemedText>
            ) : null}
          </View>
        </View>
      ) : null}

      <ActionMenu visible={Boolean(commentMenu)} onClose={() => setCommentMenu(null)} actions={commentActions} />
      {menu.element}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: Spacing.five, alignItems: 'center' },
  /** one readable column on a wide screen */
  column: { width: '100%', maxWidth: 640, gap: Spacing.three },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  bubble: { flex: 1, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
  commentHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, alignItems: 'center' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingTop: 13, paddingBottom: 13, fontSize: 16 },
});
