import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Leaderboard } from '@/components/leaderboard';
import { OnlineDot } from '@/components/online-status';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState, Screen, SectionTitle, Skeleton, TextField } from '@/components/ui';
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
  { hours: 24, label: '24 hours' },
];

export default function FriendsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const { friendships, locations, presence, shareUntil, loading, refresh, request, respond, remove, startSharing, stopSharing } =
    useFriends();
  const units = useSettings((s) => s.units);
  const last = useTrips((s) => s.lastSample);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function confirmRemove(f: Friendship) {
    Alert.alert(f.other.display_name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove friend', style: 'destructive', onPress: () => void remove(f.other.id) },
    ]);
  }

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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        <ThemedText type="subtitle">Friends</ThemedText>

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
                  <Button label="Accept" onPress={() => void respond(f.other.id, 'accepted')} />
                  <Pressable
                    onPress={() =>
                      Alert.alert('Block?', `${f.other.display_name} won't be able to send you requests.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Block', style: 'destructive', onPress: () => void respond(f.other.id, 'blocked') },
                      ])
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Decline or block ${f.other.display_name}`}
                    hitSlop={10}>
                    <MaterialCommunityIcons name="close" size={24} color={theme.textSecondary} />
                  </Pressable>
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
          <ThemedText themeColor="textSecondary">No friends yet. Add someone by their username above.</ThemedText>
        ) : (
          <Card style={{ paddingVertical: Spacing.one }}>
            {friends.map((f, i) => (
              <Pressable
                key={f.other.id}
                onPress={() => router.push({ pathname: '/friend/[id]', params: { id: f.other.id } })}
                onLongPress={() => confirmRemove(f)}
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
              </Pressable>
            ))}
          </Card>
        )}

        {outgoing.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Pending: {outgoing.map((f) => `@${f.other.username}`).join(', ')}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Long-press a friend to remove them.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
