import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { CarCard } from '@/components/car-card';
import { OnlineDot } from '@/components/online-status';
import { ActionMenu } from '@/components/social/action-menu';
import { FeedList, useFeedList } from '@/components/social/feed-list';
import { ReportSheet, type ReportTarget } from '@/components/social/report-sheet';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, EmptyState, IconButton, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { presenceLabel } from '@/lib/presence';
import { useFriends } from '@/store/friends';
import { useGarage, type Car } from '@/store/garage';

/** A friend's page: who they are, whether they're around, and the cars in their garage. */
export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = useFriends((s) => s.friendships.find((f) => f.other.id === id))?.other;
  const lastSeen = useFriends((s) => s.presence[String(id)]);
  const forUser = useGarage((s) => s.forUser);
  const [cars, setCars] = useState<Car[] | null>(null);
  const router = useRouter();
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const feedList = useFeedList({ kind: 'user', userId: String(id) }, Boolean(id));

  useEffect(() => {
    if (id) void forUser(String(id)).then(setCars);
  }, [id, forUser]);

  if (!friend) {
    return (
      <Screen safeTop={false}>
        <EmptyState icon="account-off-outline" title="Not in your crew" body="You can only see the profile of someone you're friends with.">
          <Button label="Back to friends" variant="secondary" onPress={() => router.replace('/friends')} />
        </EmptyState>
      </Screen>
    );
  }
  const status = presenceLabel(lastSeen);

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: friend.display_name, headerRight: () => <IconButton icon="dots-horizontal" label={`More options for ${friend.display_name}`} onPress={() => setMenu(true)} /> }} />
      <View style={{ alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two }}>
        <View>
          <Avatar name={friend.display_name} color={friend.avatar_color} size={88} />
          <OnlineDot lastSeen={lastSeen} size={20} />
        </View>
        <ThemedText type="subtitle">{friend.display_name}</ThemedText>
        <ThemedText themeColor="textSecondary">
          @{friend.username} · {status.text}
        </ThemedText>
      </View>

      <SectionTitle>Shared drives</SectionTitle>
      <FeedList list={feedList} lockLabel="This list" empty={<EmptyState icon="road-variant" title="Nothing shared yet" body={`${friend.display_name} hasn't shared a drive with friends.`} />} />

      <SectionTitle>{`Garage${cars ? ` · ${cars.length}` : ''}`}</SectionTitle>
      {cars && cars.length === 0 ? (
        <ThemedText themeColor="textSecondary">{friend.display_name} hasn’t added any cars yet.</ThemedText>
      ) : null}
      {(cars ?? []).map((car) => (
        <CarCard key={car.id} car={car} primary={friend.primary_car_id === car.id} />
      ))}
      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        title={friend.display_name}
        actions={[
          {
            icon: 'account-remove-outline',
            label: 'Remove friend',
            destructive: true,
            onPress: () => {
              void remove(friend.id);
              router.back();
            },
          },
          {
            icon: 'account-cancel-outline',
            label: `Block ${friend.display_name}`,
            hint: "They can't send requests or see anything of yours. They aren't told.",
            destructive: true,
            onPress: async () => {
              const err = await block(friend.id);
              if (err) Alert.alert("Couldn't block", err);
              else router.back();
            },
          },
          { icon: 'flag-outline', label: 'Report', hint: 'Tell the Convoy team about this person', onPress: () => setReport({ kind: 'user', id: friend.id, userId: friend.id, name: friend.display_name }) },
        ]}
      />
      <ReportSheet target={report} onClose={() => setReport(null)} onBlocked={() => router.back()} />
    </Screen>
  );
}
