import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConvoyLineup } from '@/components/drive/convoy-lineup';
import { convoyStop, ConvoyRoster, rosterEntries } from '@/components/drive/convoy-roster';
import { QuickCallBanner, QuickCallRow } from '@/components/drive/quick-calls';
import { RegroupCard } from '@/components/drive/regroup-card';
import { Glass } from '@/components/glass';
import { ConvoyMap, type MapPerson } from '@/components/map/convoy-map';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState, Screen, SectionTitle, TextField } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeConvoy, type ConvoyMemberView } from '@/lib/convoy';
import { formatDistance, haversine, type LngLat, speedIn, speedLabel, speedUnitLabel } from '@/lib/geo';
import { lineup } from '@/lib/lineup';
import { addReason, removeReason } from '@/lib/location';
import { formatAgo } from '@/lib/time';
import { vehicleIcon } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';
import { useClubs } from '@/store/clubs';
import { groupStop, useDrive, type Member } from '@/store/drive';
import { useNav } from '@/store/nav';
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
  const myPaint = useAuth((s) => s.profile?.vehicle_color);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const map3d = useSettings((st) => st.map3d);
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
          paint: m.profile.vehicle_color,
          label: speedLabel(units, m.position!.speed, v.status !== 'live'),
            stale: v.status !== 'live',
          };
        }),
    [views, members, myId]
  );

  // Front-to-back order for the lineup strip and the member list.
  const order = useMemo(
    () =>
      lineup(
        Object.entries(members).map(([id, m]) => ({
          id,
          name: m.profile.display_name,
          color: m.profile.avatar_color,
          coord: id === myId && me ? me : m.position ? ([m.position.lng, m.position.lat] as LngLat) : null,
          stale: id !== myId && views.find((v) => v.id === id)?.status !== 'live',
          arrived: Boolean(arrived[id]),
        })),
        myId ?? null,
        last?.speed != null && last.speed > 2 ? last.heading : null,
        destination,
        me
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, views, arrived, myId, last?.timestamp, destination?.join()]
  );

  if (!drive) return null;

  const regroupAt: LngLat | null = drive.regroup_lat != null && drive.regroup_lng != null ? [drive.regroup_lng, drive.regroup_lat] : null;
  const behind = views.filter((v) => v.behind && v.id !== myId);
  const stop = convoyStop(drive);
  const roster = rosterEntries(members, myId ?? null, last ? { coord: [last.lng, last.lat], speed: last.speed } : null, stop?.coord ?? null, now);
  const online = Object.values(members).filter((m) => m.online).length;
  const sheetHeight = Math.round(height * 0.44);

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
      {/* The whole crew live on one map: their cars, initials and speeds (like the Drive map). */}
      <ConvoyMap
        style={StyleSheet.absoluteFill}
        tilt3d={map3d}
        padding={{ top: insets.top + 96, bottom: sheetHeight }}
        me={me ? { coord: me, heading: last?.heading ?? null, vehicle: myVehicle, paint: myPaint } : null}
        people={people}
        destination={regroupAt ?? destination}
        fit={{
          key: `${drive.id}-${people.length}-${destination?.join()}-${regroupAt?.join()}`,
          points: [...people.map((p) => p.coord), ...(me ? [me] : []), ...((regroupAt ?? destination) ? [(regroupAt ?? destination)!] : [])],
        }}
      />

      {/* Top: the group chip and the join code */}
      <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={[styles.chip, { backgroundColor: club?.color ?? theme.accent }]}>
            <MaterialCommunityIcons name={club ? 'account-group' : 'car-multiple'} size={16} color="#fff" />
            <ThemedText type="smallBold" style={{ color: '#fff', flexShrink: 1 }} numberOfLines={1}>
              {drive.name} · {online} online
            </ThemedText>
          </View>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(drive.code);
              Alert.alert('Copied', `Code ${drive.code} copied to clipboard.`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Drive code ${drive.code}, tap to copy`}>
            <Glass style={styles.codePill}>
              <MaterialCommunityIcons name="content-copy" size={14} color={theme.textSecondary} />
              <ThemedText style={styles.codeText}>{drive.code}</ThemedText>
            </Glass>
          </Pressable>
        </View>
        <ConnectionPill status={status} />
        <QuickCallBanner />
        {behind.length > 0 ? (
          <View style={[styles.behind, { backgroundColor: theme.warning }]}>
            <MaterialCommunityIcons name="alert" size={18} color="#000" />
            <ThemedText type="smallBold" style={{ color: '#000', flexShrink: 1 }}>
              {behind.map((v) => members[v.id]?.profile.display_name.split(' ')[0]).join(', ')} {behind.length === 1 ? 'has' : 'have'} fallen behind
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Everyone down the left side: speed and distance to the stop */}
      {roster.length > 1 ? (
        <View style={[styles.roster, { top: insets.top + (behind.length ? 136 : 92) }]} pointerEvents="box-none">
          <ConvoyRoster entries={roster} units={units} stopLabel={stop?.label ?? null} maxHeight={height - sheetHeight - insets.top - (behind.length ? 136 : 92) - 40} />
        </View>
      ) : null}

      {/* Bottom sheet: lineup, sharing, destination, members */}
      <Glass style={[styles.sheet, { height: sheetHeight }]} intensity={50}>
        <View style={[styles.grabber, { backgroundColor: theme.textSecondary }]} />
        <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
          <ConvoyLineup entries={order} units={units} />

          <QuickCallRow />

          <RegroupCard
            drive={drive}
            members={members}
            myId={myId ?? null}
            me={me}
            myHeading={last?.speed != null && last.speed > 2 ? last.heading : null}
            isOwner={isOwner}
            units={units}
            onNavigate={(spot) => {
              if (!me) return;
              void useNav.getState().planTo({ id: `regroup-${drive.id}`, name: spot.name, detail: 'Regroup point', coord: spot.coord, category: 'Regroup point' }, me);
              router.navigate('/');
            }}
          />

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
                <Button label={destination ? 'Change' : 'Set'} variant="secondary" onPress={() => router.push({ pathname: '/search', params: { purpose: 'drive' } })} />
              ) : null}
            </View>
            {destination && me && haversine(me, destination) > 120 ? (
              <Button
                label={`Drive there · ${formatDistance(units, haversine(me, destination))}`}
                onPress={() => {
                  const place = groupStop({ ...drive, regroup_name: null, regroup_lat: null, regroup_lng: null });
                  if (!place) return;
                  void useNav.getState().planTo(place, me);
                  router.navigate('/');
                }}
              />
            ) : null}
            {isOwner && destination ? <Button label="Clear destination" variant="ghost" onPress={() => void setDestination(null)} /> : null}
          </Card>

          <SectionTitle action={<Button label="Invite" variant="ghost" onPress={() => router.push('/invite')} />}>
            {`Members · ${views.length}`}
          </SectionTitle>
          <Card style={{ paddingVertical: Spacing.one }}>
            {order.map((e, i) => {
              const v = views.find((x) => x.id === e.id);
              if (!v || !members[e.id]) return null;
              return (
                <MemberRow
                  key={e.id}
                  member={members[e.id]}
                  view={v}
                  isMe={e.id === myId}
                  isOwner={e.id === drive.owner_id}
                  units={units}
                  now={now}
                  arrivedAt={arrived[e.id]}
                  divider={i > 0}
                />
              );
            })}
          </Card>

          <Button label={isOwner ? 'End drive' : 'Leave drive'} variant="danger" onPress={confirmLeave} />
        </ScrollView>
      </Glass>
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
  codeText: { fontSize: 16, fontWeight: 800, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2 },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.pill },
  top: { position: 'absolute', left: Spacing.three, right: Spacing.three, gap: Spacing.two, alignItems: 'flex-start' },
  roster: { position: 'absolute', left: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, alignSelf: 'stretch' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill, flexShrink: 1 },
  codePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
  behind: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomWidth: 0 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, opacity: 0.4, marginTop: Spacing.two },
  sheetBody: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
});
