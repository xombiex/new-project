import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { feed, type Activity } from '@/services/feed';
import { useAuth } from '@/store/auth';
import { useFriends } from '@/store/friends';
import { useSocial } from '@/store/social';

import { ActionMenu, type MenuAction } from './action-menu';
import { ReportSheet, type ReportTarget } from './report-sheet';

/**
 * The "more" menu for a shared drive, plus the report form it can open. Yours: change who sees
 * it, or stop sharing. Someone else's: report it, or block them. Put `element` once in the
 * screen and call `open(activity)` from each card.
 */
export function useActivityMenu(onRemoved?: (activityId: string) => void) {
  const router = useRouter();
  const me = useAuth((s) => s.profile?.id);
  const block = useFriends((s) => s.block);
  const hide = useSocial((s) => s.hide);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);

  const gone = (id: string) => {
    hide(id);
    onRemoved?.(id);
  };

  const actions: MenuAction[] = !activity
    ? []
    : activity.author.id === me
      ? [
          ...(activity.tripId
            ? [{ icon: 'account-eye-outline' as const, label: 'Change who sees it', onPress: () => router.push({ pathname: '/trip/[id]', params: { id: activity.tripId! } }) }]
            : []),
          {
            icon: 'eye-off-outline',
            label: 'Stop sharing',
            hint: 'The drive stays in your own log. Likes and comments are removed.',
            destructive: true,
            onPress: async () => {
              const res = await feed.unshare(activity.id);
              if (res.ok) gone(activity.id);
              else Alert.alert("Couldn't stop sharing", res.error.message);
            },
          },
        ]
      : [
          {
            icon: 'flag-outline',
            label: 'Report this drive',
            hint: 'Tell the Convoy team something is wrong with it',
            onPress: () => setReport({ kind: 'activity', id: activity.id, userId: activity.author.id, name: activity.author.display_name }),
          },
          {
            icon: 'account-cancel-outline',
            label: `Block ${activity.author.display_name}`,
            hint: "You stop seeing each other's drives and location. They aren't told.",
            destructive: true,
            onPress: async () => {
              const err = await block(activity.author.id);
              if (err) Alert.alert("Couldn't block", err);
              else gone(activity.id);
            },
          },
        ];

  return {
    open: setActivity,
    /** for comments and people: opens the report form directly */
    report: setReport,
    element: (
      <>
        <ActionMenu visible={Boolean(activity)} onClose={() => setActivity(null)} actions={actions} />
        <ReportSheet target={report} onClose={() => setReport(null)} onBlocked={() => activity && gone(activity.id)} />
      </>
    ),
  };
}
