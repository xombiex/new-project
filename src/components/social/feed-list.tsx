import { useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, ErrorState, Notice, Skeleton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { feed, type Activity, type FeedScope } from '@/services/feed';
import { useSettings } from '@/store/settings';
import { useDrivingLock, useSocial } from '@/store/social';

import { ActivityCard } from './activity-card';
import { DrivingLock } from './driving-lock';
import { useActivityMenu } from './use-activity-menu';

function CardSkeleton() {
  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <Skeleton height={44} width={44} radius={22} />
        <View style={{ flex: 1, gap: Spacing.two }}>
          <Skeleton height={14} width="40%" />
          <Skeleton height={10} width="30%" />
        </View>
      </View>
      <Skeleton height={22} width="55%" />
      <Skeleton height={150} />
      <View style={{ flexDirection: 'row', gap: Spacing.three }}>
        <Skeleton height={34} style={{ flex: 1 }} />
        <Skeleton height={34} style={{ flex: 1 }} />
        <Skeleton height={34} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const scopeKey = (s: FeedScope) => (s.kind === 'home' ? 'home' : s.kind === 'club' ? `club:${s.clubId}` : `user:${s.userId}`);

/**
 * A list of shared drives for one scope (everything, one club, one person), a page at a time.
 * Returns the pieces rather than a scroll view, so each screen can put them in its own layout
 * and hook `refresh` to its pull-to-refresh.
 */
export function useFeedList(scope: FeedScope, enabled = true) {
  const key = scopeKey(scope);
  const list = usePagedList<Activity>(key, (cursor) => feed.list(scope, cursor), enabled);
  return list;
}

export function FeedList({ list, empty, lockLabel }: { list: ReturnType<typeof useFeedList>; empty: ReactNode; lockLabel?: string }) {
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const locked = useDrivingLock();
  const gone = useSocial((s) => s.gone);
  const toggleLike = useSocial((s) => s.toggleLike);
  const { setItems } = list;
  const menu = useActivityMenu(useCallback((id: string) => setItems((items) => items.filter((a) => a.id !== id)), [setItems]));

  if (locked) return <DrivingLock what={lockLabel} />;
  if (list.status === 'loading') {
    return (
      <View style={{ gap: Spacing.three }} accessibilityLabel="Loading drives" accessibilityRole="progressbar">
        <CardSkeleton />
        <CardSkeleton />
      </View>
    );
  }
  if (list.status === 'error') return <ErrorState message={list.error ?? 'Something went wrong.'} onRetry={() => void list.retry()} />;

  const items = list.items.filter((a) => !gone[a.id]);
  if (items.length === 0) return <>{empty}</>;

  return (
    <View style={{ gap: Spacing.three }}>
      {list.error ? <Notice tone="warning">{list.error}</Notice> : null}
      {items.map((a) => (
        <ActivityCard
          key={a.id}
          activity={a}
          units={units}
          onOpen={() => router.push({ pathname: '/activity/[id]', params: { id: a.id } })}
          onLike={async () => {
            const err = await toggleLike(a);
            if (err) Alert.alert("Couldn't save your like", err);
          }}
          onMenu={() => menu.open(a)}
        />
      ))}
      {list.hasMore ? <Button label="Show more drives" variant="secondary" onPress={() => void list.loadMore()} loading={list.status === 'more'} /> : null}
      {menu.element}
    </View>
  );
}
