import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConvoyMap, type MapPerson } from '@/components/map/convoy-map';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState, Screen, SectionTitle, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeConvoy, type ConvoyMemberView } from '@/lib/convoy';
import { formatDistance, speedIn, speedUnitLabel, type LngLat } from '@/lib/geo';
import { addReason, removeReason } from '@/lib/location';
import { formatAgo } from '@/lib/time';
import { vehicleIcon } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';
import { useClubs } from '@/store/clubs';
import { useDrive, type Member } from '@/store/drive';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

export default function ConvoyScreen() {
  const profile = useAuth((s) => s.profile);
  const drive = useDrive((s) => s.drive);
  const router = useRouter();

  if (!profile) {
    return (
      <Screen>
        <Hero />
        <EmptyState title="Sign in to drive together" body="Group drives need an account so your friends know who's who.">
          <Button label="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </EmptyState>
      </Screen>
    );
  }
  return drive ? <ActiveDrive /> : <StartDrive />;
}

function Hero() {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
      <MaterialCommunityIcons name="car-multiple" size={40} color={theme.accent} />
      <ThemedText type="subtitle">Drive together</ThemedText>
      <ThemedText themeColor="textSecondary">
        Start a group drive, share the code, and see everyone on one live map: where they are, how fast they are
        going, and who has fallen behind.
      </ThemedText>
    </View>
  );
}

function StartDrive() {
  const { create, join } = useDrive();
  const params = useLocalSearchParams<{ code?: string }>();
  const [name, setName] = useState('');
  const [code, setCode] = useState(params.code?.toUpperCase() ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<{ create?: string; join?: string }>({});

  async function onCreate() {
    setBusy('create');
    const err = await create(name || 'Group drive');
    setBusy(null);
    setError({ create: err ?? undefined });
  }

  async function onJoin() {
    setBusy('join');
    const err = await join(code);
    setBusy(null);
    setError({ join: err ?? undefined });
  }

  return (
    <Screen>
      <Hero />
      <Card style={{ gap: Spacing.three }}>
        <ThemedText style={styles.cardTitle}>Start a drive</ThemedText>
        <TextField placeholder="Sunday canyon run" value={name} onChangeText={setName} maxLength={60} error={error.create} />
        <Button label="Create group drive" onPress={onCreate} loading={busy === 'create'} disabled={busy !== null} />
      </Card>
      <Card style={{ gap: Spacing.three }}>
        <ThemedText style={styles.cardTitle}>Join with a code</ThemedText>
        <TextField
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.codeInput}
          error={error.join}
        />
        <Button
          label="Join drive"
          variant="secondary"
          onPress={onJoin}
          loading={busy === 'join'}
          disabled={code.length !== 6 || busy !== null}
        />
      </Card>
      <ThemedText type="small" themeColor="textSecondary">
        Your location is only visible to members of the drive while you are in it, and you can pause sharing at any
        time.
      </ThemedText>
      <ClubsSection />
    </Screen>
  );
}

function ClubsSection() {
  const theme = useTheme();
  const router = useRouter();
  const { mine, loadMine, join } = useClubs();
  const canCreate = useEntitled('club');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadMine();
    }, [loadMine])
  );

  async function onJoin() {
    const res = await join(code);
    if (res.error) setError(res.error);
    else {
      setCode('');
      setError(null);
      router.push({ pathname: '/club/[id]', params: { id: res.club!.id } });
    }
  }

  return (
    <>
      <SectionTitle
        action={
          <Button
            label={canCreate ? 'New club' : 'Start a club'}
            variant="ghost"
            onPress={() => (canCreate ? router.push('/club/new') : router.push({ pathname: '/paywall', params: { offering: 'clubs' } }))}
          />
        }>
        Clubs
      </SectionTitle>
      {mine.map((c) => (
        <Pressable key={c.id} onPress={() => router.push({ pathname: '/club/[id]', params: { id: c.id } })} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.color, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="account-group" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }}>{c.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {c.role === 'member' ? 'Member' : c.role === 'owner' ? 'Owner' : 'Admin'}
              </ThemedText>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
          </Card>
        </Pressable>
      ))}
      <Card style={{ gap: Spacing.two }}>
        <ThemedText style={{ fontWeight: 700 }}>Join a club</ThemedText>
        <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="CLUB CODE"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              error={error}
            />
          </View>
          <Button label="Join" variant="secondary" disabled={code.length !== 8} onPress={onJoin} />
        </View>
      </Card>
    </>
  );
}

function ActiveDrive() {
  const theme = useTheme();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const { drive, members, status, sharing, setSharing, leave, setDestination, arrived } = useDrive();
  const club = useClubs((c) => c.mine.find((x) => x.id === drive?.club_id));
  const myId = useAuth((s) => s.session?.user.id);
  const last = useTrips((s) => s.lastSample);
  const myVehicle = useAuth((s) => s.profile?.vehicle);
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());

  useFocusEffect(
    useCallback(() => {
      void addReason('map');
      return () => void removeReason('map');
    }, [])
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const me: LngLat | null = last ? [last.lng, last.lat] : null;
  const destination: LngLat | null = drive?.dest_lat != null && drive.dest_lng != null ? [drive.dest_lng, drive.dest_lat] : null;
  const isOwner = drive?.owner_id === myId;

  const views = useMemo(() => {
    const list = Object.entries(members).map(([id, m]) => ({ id, online: m.online, position: m.position }));
    return analyzeConvoy(list, me, destination, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, now, last?.timestamp, drive?.dest_lat, drive?.dest_lng]);

  const people = useMemo<MapPerson[]>(
    () =>
      views
        .filter((v) => v.id !== myId && members[v.id]?.position)
        .map((v) => {
          const m = members[v.id];
          return {
            id: v.id,
            name: m.profile.display_name,
            color: m.profile.avatar_color,
            coord: [m.position!.lng, m.position!.lat],
            heading: m.position!.heading,
            icon: vehicleIcon(m.profile.vehicle),
            vehicle: m.profile.vehicle,
            stale: v.status !== 'live',
          };
        }),
    [views, members, myId]
  );

  if (!drive) return null;

  const sorted = [...views].sort((a, b) => {
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    return (a.distanceFromMeM ?? Infinity) - (b.distanceFromMeM ?? Infinity);
  });
  const behind = views.filter((v) => v.behind && v.id !== myId);

  function confirmLeave() {
    Alert.alert(
      isOwner ? 'End drive for everyone?' : 'Leave drive?',
      isOwner ? 'The drive will close and members stop seeing each other.' : 'You will stop sharing your location with this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isOwner ? 'End drive' : 'Leave', style: 'destructive', onPress: () => void leave() },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ConvoyMap
        style={{ height: 300 + insets.top }}
        padding={{ top: insets.top }}
        me={me ? { coord: me, heading: last?.heading ?? null, vehicle: myVehicle } : null}
        people={people}
        destination={destination}
        fit={{
          key: `${drive.id}-${people.length}-${destination?.join()}`,
          points: [...people.map((p) => p.coord), ...(me ? [me] : []), ...(destination ? [destination] : [])],
        }}
      />
      <Screen safeTop={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {club ? (
              <View style={[styles.clubPill, { backgroundColor: club.color }]}>
                <MaterialCommunityIcons name="account-group" size={14} color="#fff" />
                <ThemedText type="smallBold" style={{ color: '#fff' }} numberOfLines={1}>
                  {club.name}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText style={{ fontSize: 24, fontWeight: 800 }} numberOfLines={1}>
              {drive.name}
            </ThemedText>
            <ConnectionPill status={status} />
          </View>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(drive.code);
              Alert.alert('Copied', `Code ${drive.code} copied to clipboard.`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Drive code ${drive.code}, tap to copy`}
            style={[styles.code, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={styles.codeText}>{drive.code}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              tap to copy
            </ThemedText>
          </Pressable>
        </View>

        {behind.length > 0 ? (
          <Card style={{ borderColor: theme.warning, flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
            <MaterialCommunityIcons name="alert" size={22} color={theme.warning} />
            <ThemedText style={{ flex: 1 }}>
              {behind.map((v) => members[v.id]?.profile.display_name).join(', ')}{' '}
              {behind.length === 1 ? 'has' : 'have'} fallen behind. Regroup when it is safe to.
            </ThemedText>
          </Card>
        ) : null}

        <Card style={{ gap: Spacing.three }}>
          <View style={styles.row}>
            <MaterialCommunityIcons name={sharing ? 'broadcast' : 'broadcast-off'} size={22} color={sharing ? theme.success : theme.textSecondary} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }}>{sharing ? 'Sharing your location' : 'Location paused'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {sharing ? 'Visible to this group only, including in the background.' : 'The group sees your last position as stale.'}
              </ThemedText>
            </View>
            <Switch value={sharing} onValueChange={setSharing} accessibilityLabel="Share location with group" />
          </View>
          <View style={styles.row}>
            <MaterialCommunityIcons name="flag-checkered" size={22} color={theme.textSecondary} />
            <ThemedText style={{ flex: 1 }} numberOfLines={2}>
              {drive.destination_name ?? 'No destination set'}
            </ThemedText>
            {isOwner ? (
              <Button
                label={destination ? 'Change' : 'Set'}
                variant="secondary"
                onPress={() => router.push({ pathname: '/search', params: { purpose: 'drive' } })}
              />
            ) : null}
          </View>
          {isOwner && destination ? (
            <Button label="Clear destination" variant="ghost" onPress={() => void setDestination(null)} />
          ) : null}
        </Card>

        <SectionTitle action={<Button label="Invite" variant="ghost" onPress={() => router.push('/invite')} />}>
          {`Members · ${views.length}`}
        </SectionTitle>
        <Card style={{ paddingVertical: Spacing.one }}>
          {sorted.map((v, i) => (
            <MemberRow
              key={v.id}
              member={members[v.id]}
              view={v}
              isMe={v.id === myId}
              isOwner={v.id === drive.owner_id}
              units={units}
              now={now}
              arrivedAt={arrived[v.id]}
              divider={i > 0}
            />
          ))}
        </Card>

        <Button label={isOwner ? 'End drive' : 'Leave drive'} variant="danger" onPress={confirmLeave} />
      </Screen>
    </View>
  );
}

function ConnectionPill({ status }: { status: string }) {
  const theme = useTheme();
  const map: Record<string, { color: string; label: string }> = {
    live: { color: theme.success, label: 'Live' },
    connecting: { color: theme.warning, label: 'Connecting…' },
    reconnecting: { color: theme.warning, label: 'Reconnecting…' },
    idle: { color: theme.danger, label: 'Disconnected' },
  };
  const s = map[status] ?? map.idle;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, marginTop: Spacing.half }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
      <ThemedText type="small" themeColor="textSecondary">
        {s.label}
      </ThemedText>
    </View>
  );
}

function MemberRow({
  member,
  view,
  isMe,
  isOwner,
  units,
  now,
  arrivedAt,
  divider,
}: {
  member: Member | undefined;
  view: ConvoyMemberView;
  isMe: boolean;
  isOwner: boolean;
  units: 'imperial' | 'metric';
  now: number;
  arrivedAt?: number;
  divider: boolean;
}) {
  const theme = useTheme();
  if (!member) return null;
  const pos = member.position;
  const speed = pos?.speed != null && pos.speed >= 0 ? `${Math.round(speedIn(units, pos.speed))} ${speedUnitLabel(units)}` : null;

  let detail: string;
  if (arrivedAt) view = { ...view, behind: false, toDestinationM: null };
  switch (arrivedAt ? 'arrived' : view.status) {
    case 'arrived':
      detail = `Arrived ${formatAgo(arrivedAt!, now)}`;
      break;
    case 'live':
      detail = [speed, !isMe && view.distanceFromMeM != null ? `${formatDistance(units, view.distanceFromMeM)} away` : null]
        .filter(Boolean)
        .join(' · ') || 'Live';
      break;
    case 'stale':
      detail = `Signal lost · seen ${formatAgo(view.lastSeenMs!, now)}`;
      break;
    case 'waiting':
      detail = 'Online, waiting for GPS';
      break;
    default:
      detail = view.lastSeenMs ? `Offline · seen ${formatAgo(view.lastSeenMs, now)}` : 'Offline';
  }

  return (
    <View style={[styles.member, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <Avatar name={member.profile.display_name} color={member.profile.avatar_color} size={40} />
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>
          {member.profile.display_name}
          {isMe ? ' (you)' : ''}
          {isOwner ? ' · leader' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
      {view.behind ? (
        <View style={[styles.badge, { backgroundColor: theme.warning }]}>
          <ThemedText type="smallBold" style={{ color: '#000' }}>
            Behind
          </ThemedText>
        </View>
      ) : null}
      {view.toDestinationM != null && view.status === 'live' ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {formatDistance(units, view.toDestinationM)} to go
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 18, fontWeight: 700 },
  codeInput: { fontSize: 24, fontWeight: 800, letterSpacing: 6, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  clubPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    marginBottom: Spacing.one,
  },
  code: { alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md },
  codeText: { fontSize: 22, fontWeight: 800, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2 },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.pill },
});
