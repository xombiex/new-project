import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ConvoyMap } from '@/components/map/convoy-map';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, SectionTitle, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LngLat } from '@/lib/geo';
import { buyTicket, formatPrice } from '@/lib/payments';
import { useAuth } from '@/store/auth';
import { useClubs, type ClubEvent, type Club, type ClubRole, type Rsvp, type RsvpStatus } from '@/store/clubs';
import { useDrive } from '@/store/drive';

type Data = { event: ClubEvent; club: Club; role: ClubRole | null; rsvps: Rsvp[] };

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const me = useAuth((s) => s.session?.user.id);
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    void useClubs.getState().loadEvent(id).then(setData);
  }, [id]);
  useFocusEffect(reload);

  if (data === undefined) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (data === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ThemedText themeColor="textSecondary">Event not found</ThemedText>
      </View>
    );
  }

  const { event, club, role, rsvps } = data;
  const admin = role === 'owner' || role === 'admin';
  const mine = rsvps.find((r) => r.user_id === me);
  const going = rsvps.filter((r) => r.status === 'going');
  const interested = rsvps.filter((r) => r.status === 'interested');
  const paid = event.price_cents > 0;
  const full = event.capacity != null && going.length >= event.capacity && mine?.status !== 'going';
  const starts = new Date(event.starts_at);
  const meet: LngLat | null = event.meet_lat != null && event.meet_lng != null ? [event.meet_lng, event.meet_lat] : null;
  const dest: LngLat | null = event.dest_lat != null && event.dest_lng != null ? [event.dest_lng, event.dest_lat] : null;
  const points = [meet, dest].filter(Boolean) as LngLat[];

  async function setRsvp(status: RsvpStatus) {
    const err = await useClubs.getState().rsvp(event.id, status);
    if (err) Alert.alert('RSVP', err);
    reload();
  }

  async function buy() {
    setBusy(true);
    const err = await buyTicket(event.id);
    setBusy(false);
    if (err) Alert.alert('Tickets', err);
    reload(); // the webhook marks the ticket paid; refresh when they come back
  }

  async function startDrive() {
    setBusy(true);
    const err = await useDrive.getState().startClubDrive(club.id, event.id);
    setBusy(false);
    if (err) Alert.alert('Could not start', err);
    else router.navigate('/convoy');
  }

  async function joinDrive() {
    setBusy(true);
    const err = await useDrive.getState().joinClubDrive(event.drive_id!);
    setBusy(false);
    if (err) Alert.alert('Could not join', err);
    else router.navigate('/convoy');
  }

  return (
    <>
      <Stack.Screen options={{ title: club.name }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ paddingBottom: Spacing.six }}>
        {points.length ? (
          <ConvoyMap style={{ height: 200 }} showUser={false} destination={dest ?? meet} fit={{ key: event.id, points }} />
        ) : (
          <View style={{ height: 8, backgroundColor: club.color }} />
        )}
        <View style={{ padding: Spacing.three, gap: Spacing.three }}>
          <View style={{ gap: Spacing.one }}>
            <ThemedText style={styles.title}>{event.title}</ThemedText>
            <ThemedText style={{ fontWeight: 600 }}>
              {starts.toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </ThemedText>
          </View>

          <Card style={{ gap: Spacing.three }}>
            {event.meet_name ? (
              <View style={styles.row}>
                <MaterialCommunityIcons name="map-marker-radius" size={22} color={theme.accent} />
                <ThemedText style={{ flex: 1 }}>Meet at {event.meet_name}</ThemedText>
              </View>
            ) : null}
            {event.dest_name ? (
              <View style={styles.row}>
                <MaterialCommunityIcons name="flag-checkered" size={22} color={theme.accent} />
                <ThemedText style={{ flex: 1 }}>Driving to {event.dest_name}</ThemedText>
              </View>
            ) : null}
            <View style={styles.row}>
              <MaterialCommunityIcons name={paid ? 'ticket' : 'ticket-outline'} size={22} color={paid ? theme.speed : theme.textSecondary} />
              <ThemedText style={{ flex: 1 }}>
                {paid ? `${formatPrice(event.price_cents, event.currency)} per ticket` : 'Free'}
                {event.capacity ? ` · ${going.length}/${event.capacity} spots` : ''}
              </ThemedText>
            </View>
          </Card>

          {event.description ? <ThemedText>{event.description}</ThemedText> : null}

          {event.drive_id ? (
            <Button label="Join the club drive" size="lg" loading={busy} onPress={joinDrive} />
          ) : admin ? (
            <Button label="Start the drive" size="lg" loading={busy} onPress={startDrive} />
          ) : null}

          {paid ? (
            mine?.paid ? (
              <Card style={[styles.row, { borderColor: theme.success }]}>
                <MaterialCommunityIcons name="ticket-confirmation" size={24} color={theme.success} />
                <ThemedText style={{ fontWeight: 700 }}>You have a ticket</ThemedText>
              </Card>
            ) : (
              <>
                <Button
                  label={full ? 'Sold out' : `Buy ticket · ${formatPrice(event.price_cents, event.currency)}`}
                  size="lg"
                  disabled={full}
                  loading={busy}
                  onPress={buy}
                />
                <Button
                  label={mine?.status === 'interested' ? 'Interested ✓' : 'Interested'}
                  variant="secondary"
                  onPress={() => void setRsvp(mine?.status === 'interested' ? 'not_going' : 'interested')}
                />
              </>
            )
          ) : (
            <Segmented
              options={[
                { value: 'going', label: full ? 'Full' : 'Going' },
                { value: 'interested', label: 'Maybe' },
                { value: 'not_going', label: "Can't go" },
              ]}
              value={mine?.status ?? ('' as RsvpStatus)}
              onChange={(s) => (s === 'going' && full ? null : void setRsvp(s))}
            />
          )}

          <SectionTitle>{`Going · ${going.length}`}</SectionTitle>
          {going.length === 0 ? (
            <ThemedText themeColor="textSecondary">Be the first.</ThemedText>
          ) : (
            <View style={styles.avatars}>
              {going.map((r) => (
                <View key={r.user_id} style={{ alignItems: 'center', width: 64, gap: 2 }}>
                  <Avatar name={r.profile.display_name} color={r.profile.avatar_color} size={44} />
                  <ThemedText type="small" numberOfLines={1}>
                    {r.profile.display_name.split(' ')[0]}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
          {interested.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              {interested.length} interested
            </ThemedText>
          ) : null}

          {admin ? (
            <Button
              label="Cancel event"
              variant="ghost"
              onPress={() =>
                Alert.alert('Cancel this event?', paid ? 'Refund any tickets from your Stripe dashboard.' : undefined, [
                  { text: 'Keep', style: 'cancel' },
                  {
                    text: 'Cancel event',
                    style: 'destructive',
                    onPress: async () => {
                      await useClubs.getState().deleteEvent(event.id);
                      router.back();
                    },
                  },
                ])
              }
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: 800 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
