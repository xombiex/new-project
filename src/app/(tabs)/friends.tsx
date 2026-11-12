import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Leaderboard } from '@/components/leaderboard';
import { OnlineDot } from '@/components/online-status';
import { ActionMenu, type MenuAction } from '@/components/social/action-menu';
import { FeedList, useFeedList } from '@/components/social/feed-list';
import { ReportSheet, type ReportTarget } from '@/components/social/report-sheet';
import { ThemedText } from '@/components/themed-text';
import { ScreenTitle } from '@/components/shop';
import { Avatar, Button, Card, EmptyState, IconButton, Screen, SectionTitle, Segmented, Skeleton, TextField } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, haversine } from '@/lib/geo';
import { SITE_URL } from '@/lib/legal';
import { isOnline, presenceLabel } from '@/lib/presence';
import { formatAgo } from '@/lib/time';
import { useAuth } from '@/store/auth';
import { useFriends, type Friendship } from '@/store/friends';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

const SHARE_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '1 day' },
];

export default function FriendsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const { friendships, locations, presence, shareUntil, loading, refresh, request, accept, block, remove, startSharing, stopSharing } =
    useFriends();
  const units = useSettings((s) => s.units);
  const last = useTrips((s) => s.lastSample);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'feed' | 'people'>('feed');
  const [menuFor, setMenuFor] = useState<Friendship | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const feedList = useFeedList({ kind: 'home' }, Boolean(profile));

  useFocusEffect(
    useCallback(() => {
      if (profile) void refresh();
    }, [profile, refresh])
  );

  if (!profile) {
    return (
      <Screen>
        <EmptyState title="Find your crew" body="Sign in to add friends and choose who can see where you are.">
          <Button label="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </EmptyState>
      </Screen>
    );
  }

  const incoming = friendships.filter((f) => f.status === 'pending' && !f.outgoing);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.outgoing);
  const friends = friendships.filter((f) => f.status === 'accepted');

  async function add() {
    setBusy(true);
    const err = await request(username);
    setBusy(false);
    setError(err);
    if (!err) setUsername('');
  }

  function confirmBlock(f: Friendship) {
    Alert.alert(`Block ${f.other.display_name}?`, "They won't be able to send you requests or see your location, drives or garage. They aren't told.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const err = await block(f.other.id);
          if (err) Alert.alert("Couldn't block", err);
        },
      },
    ]);
  }

  /** What you can do with one person: a friend, or someone who asked to be one. */
  const personActions: MenuAction[] = !menuFor
    ? []
    : [
        ...(menuFor.status === 'accepted'
          ? [
              { icon: 'account-outline' as const, label: 'View profile', onPress: () => router.push({ pathname: '/friend/[id]', params: { id: menuFor.other.id } }) },
              { icon: 'account-remove-outline' as const, label: 'Remove friend', destructive: true, onPress: () => void remove(menuFor.other.id) },
            ]
          : [{ icon: 'close' as const, label: 'Decline request', onPress: () => void remove(menuFor.other.id) }]),
        { icon: 'account-cancel-outline', label: `Block ${menuFor.other.display_name}`, hint: "They can't send requests or see anything of yours. They aren't told.", destructive: true, onPress: () => confirmBlock(menuFor) },
        { icon: 'flag-outline', label: 'Report', hint: 'Tell the Convoy team about this person', onPress: () => setReport({ kind: 'user', id: menuFor.other.id, userId: menuFor.other.id, name: menuFor.other.display_name }) },
      ];

  function friendDetail(f: Friendship) {
    const loc = locations[f.other.id];
    if (!loc) return 'Not sharing location';
    const parts = [formatAgo(Date.parse(loc.updated_at))];
    if (last) parts.unshift(`${formatDistance(units, haversine([last.lng, last.lat], [loc.lng, loc.lat]))} away`);
    const moving = loc.speed_mps != null && loc.speed_mps > 2 && Date.now() - Date.parse(loc.updated_at) < 5 * 60_000;
    parts.push(moving ? 'moving' : 'stopped');
    return parts.join(' · ');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={view === 'feed' ? feedList.status === 'refreshing' : loading} onRefresh={() => void (view === 'feed' ? feedList.refresh() : refresh())} />}>
        <View style={styles.column}>
        <ScreenTitle kicker={friends.length ? `${friends.length} in your crew` : 'Your crew'} title="Friends" />
        <Segmented
          options={[
            { value: 'feed', label: 'Drives' },
            { value: 'people', label: incoming.length ? `People · ${incoming.length} new` : 'People' },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'feed' ? (
          <FeedList
            list={feedList}
            empty={
              <EmptyState icon="road-variant" title="No drives here yet" body={friends.length ? 'When you or a friend shares a drive, it shows up here. Open one of your drives in Stats to share it.' : 'Add a friend, then share a drive from Stats. Shared drives from your crew show up here.'}>
                <Button label={friends.length ? 'Go to my drives' : 'Find friends'} variant="secondary" onPress={() => (friends.length ? router.push({ pathname: '/stats', params: { view: 'drives' } }) : setView('people'))} />
              </EmptyState>
            }
          />
        ) : (
          <>
        <Card style={{ gap: Spacing.two }}>
          <View style={styles.row}>
            <MaterialCommunityIcons
              name={shareUntil ? 'map-marker-radius' : 'map-marker-off-outline'}
              size={24}
              color={shareUntil ? theme.success : theme.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }}>
                {shareUntil ? 'Friends can see your location' : 'Location hidden from friends'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {shareUntil
                  ? `Until ${new Date(shareUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Updates about once a minute while Convoy is open or tracking.`
                  : 'Share your last-known position with all accepted friends for a set time.'}
              </ThemedText>
            </View>
          </View>
          {shareUntil ? (
            <Button label="Stop sharing now" variant="danger" onPress={() => void stopSharing()} />
          ) : (
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              {SHARE_OPTIONS.map((o) => (
                <Button key={o.hours} label={o.label} variant="secondary" onPress={() => void startSharing(o.hours)} style={{ flex: 1 }} />
              ))}
            </View>
          )}
        </Card>

        <Card style={{ gap: Spacing.two }}>
          <ThemedText style={{ fontWeight: 700 }}>Add a friend</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <TextField
                placeholder="username"
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
                autoCorrect={false}
                error={error}
              />
            </View>
            <Button label="Add" onPress={add} loading={busy} disabled={username.length < 3} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Your username is @{profile.username}
          </ThemedText>
          <Button
            label="Share my invite link"
            variant="secondary"
            icon={<MaterialCommunityIcons name="link-variant" size={18} color={theme.text} />}
            onPress={() => void shareInvite(profile.username)}
          />
        </Card>

        {incoming.length > 0 ? (
          <>
            <SectionTitle>Requests</SectionTitle>
            <Card style={{ paddingVertical: Spacing.one }}>
              {incoming.map((f, i) => (
                <View key={f.other.id} style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <Avatar name={f.other.display_name} color={f.other.avatar_color} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: 700 }}>{f.other.display_name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      @{f.other.username}
                    </ThemedText>
                  </View>
                  <Button label="Accept" onPress={() => void accept(f.other.id)} />
                  <IconButton icon="dots-horizontal" label={`Decline, block or report ${f.other.display_name}`} color={theme.textSecondary} onPress={() => setMenuFor(f)} />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Leaderboard />

        <SectionTitle>{`Friends · ${friends.length}`}</SectionTitle>
        {friends.length === 0 && loading ? (
          <View style={{ gap: Spacing.two }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={56} />
            ))}
          </View>
        ) : friends.length === 0 ? (
          <ThemedText themeColor="textSecondary">No crew yet. Add someone by their username above.</ThemedText>
        ) : (
          <Card style={{ paddingVertical: Spacing.one }}>
            {friends.map((f, i) => (
              <Pressable
                key={f.other.id}
                onPress={() => router.push({ pathname: '/friend/[id]', params: { id: f.other.id } })}
                onLongPress={() => setMenuFor(f)}
                // No button role: the row holds a real button (the menu), and one can't sit inside another on the web.
                accessibilityLabel={`${f.other.display_name}. Open profile`}
                style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View>
                  <Avatar name={f.other.display_name} color={f.other.avatar_color} />
                  <OnlineDot lastSeen={presence[f.other.id]} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: 700 }}>{f.other.display_name}</ThemedText>
                  <ThemedText type="small" numberOfLines={1} style={{ color: isOnline(presence[f.other.id]) ? theme.success : theme.textSecondary }}>
                    {[presenceLabel(presence[f.other.id]).text, friendDetail(f)].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                {locations[f.other.id] ? <MaterialCommunityIcons name="map-marker" size={20} color={theme.success} /> : null}
                <IconButton icon="dots-horizontal" label={`More options for ${f.other.display_name}`} color={theme.textSecondary} onPress={() => setMenuFor(f)} />
              </Pressable>
            ))}
          </Card>
        )}

        {outgoing.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Pending: {outgoing.map((f) => `@${f.other.username}`).join(', ')}
          </ThemedText>
        ) : null}
          </>
        )}
        </View>
      </ScrollView>
      <ActionMenu visible={Boolean(menuFor)} onClose={() => setMenuFor(null)} title={menuFor?.other.display_name} actions={personActions} />
      <ReportSheet target={report} onClose={() => setReport(null)} onBlocked={() => void refresh()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** one readable column on a wide screen */
  column: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2 },
});

/** Share sheet where there is one; desktop browsers often have none, so copy the link instead. */
async function shareInvite(username: string) {
  const url = `${SITE_URL}/add/${username}`;
  try {
    if (Platform.OS === 'web' && !navigator.share) throw new Error('no share sheet');
    await Share.share({ message: `Add me on Convoy: ${url}`, url });
  } catch {
    await Clipboard.setStringAsync(url);
    if (Platform.OS === 'web') window.alert(`Invite link copied:
${url}`);
    else Alert.alert('Invite link copied', url);
  }
}
