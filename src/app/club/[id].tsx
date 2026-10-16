import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, setUpPayouts } from '@/lib/payments';
import { useClubs, type ClubDetail } from '@/store/clubs';
import { useDrive } from '@/store/drive';

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const [data, setData] = useState<ClubDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const currentDrive = useDrive((s) => s.drive);

  const reload = useCallback(() => {
    void useClubs.getState().load(id).then(setData);
  }, [id]);
  useFocusEffect(reload);

  if (data === undefined) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (data === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ThemedText themeColor="textSecondary">Club not found</ThemedText>
      </View>
    );
  }

  const { club, role, members, events, drives, payouts } = data;
  const admin = role === 'owner' || role === 'admin';

  async function startDrive() {
    setBusy(true);
    const err = await useDrive.getState().startClubDrive(club.id);
    setBusy(false);
    if (err) Alert.alert('Could not start', err);
    else router.navigate('/convoy');
  }

  async function joinDrive(driveId: string) {
    setBusy(true);
    const err = await useDrive.getState().joinClubDrive(driveId);
    setBusy(false);
    if (err) Alert.alert('Could not join', err);
    else router.navigate('/convoy');
  }

  async function payouts_() {
    const err = await setUpPayouts(club.id);
    if (err) Alert.alert('Payouts', err);
    reload();
  }

  return (
    <>
      <Stack.Screen options={{ title: club.name }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ paddingBottom: Spacing.six }}>
        <View style={[styles.hero, { backgroundColor: club.color }]}>
          <ThemedText style={styles.heroTitle}>{club.name}</ThemedText>
          <ThemedText style={{ color: 'rgba(255,255,255,0.85)' }}>
            {members.length} member{members.length === 1 ? '' : 's'}
            {role ? ` · you're ${role === 'member' ? 'a member' : `the ${role}`}` : ''}
          </ThemedText>
        </View>

        <View style={{ padding: Spacing.three, gap: Spacing.three }}>
          {club.description ? <ThemedText>{club.description}</ThemedText> : null}

          {drives.length > 0 ? (
            <Card style={{ gap: Spacing.two, borderColor: theme.success }}>
              {drives.map((d) => (
                <View key={d.id} style={styles.row}>
                  <MaterialCommunityIcons name="car-multiple" size={24} color={theme.success} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: 700 }}>{d.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Club drive happening now
                    </ThemedText>
                  </View>
                  {currentDrive?.id === d.id ? (
                    <Button label="Open" variant="secondary" onPress={() => router.navigate('/convoy')} />
                  ) : (
                    <Button label="Join" loading={busy} onPress={() => void joinDrive(d.id)} />
                  )}
                </View>
              ))}
            </Card>
          ) : null}

          {admin ? (
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Button label="Start drive now" loading={busy} onPress={startDrive} style={{ flex: 1 }} />
              <Button
                label="New event"
                variant="secondary"
                onPress={() => router.push({ pathname: '/event/new', params: { club: club.id } })}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          <SectionTitle>Upcoming</SectionTitle>
          {events.length === 0 ? (
            <ThemedText themeColor="textSecondary">No events scheduled.</ThemedText>
          ) : (
            <Card style={{ paddingVertical: Spacing.one }}>
              {events.map((e, i) => {
                const d = new Date(e.starts_at);
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
                    accessibilityRole="button"
                    style={[styles.event, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                    <View style={[styles.date, { backgroundColor: club.color }]}>
                      <ThemedText style={styles.dateMonth}>{d.toLocaleDateString([], { month: 'short' }).toUpperCase()}</ThemedText>
                      <ThemedText style={styles.dateDay}>{d.getDate()}</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>
                        {e.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                        {e.meet_name ? ` · ${e.meet_name}` : ''}
                      </ThemedText>
                    </View>
                    {e.price_cents > 0 ? (
                      <ThemedText type="smallBold" style={{ color: theme.speed }}>
                        {formatPrice(e.price_cents, e.currency)}
                      </ThemedText>
                    ) : null}
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
                  </Pressable>
                );
              })}
            </Card>
          )}

          {admin ? (
            <>
              <SectionTitle>Invite members</SectionTitle>
              <Card style={styles.row}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Club code
                  </ThemedText>
                  <ThemedText style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>{club.invite_code}</ThemedText>
                </View>
                <Button label="Copy" variant="secondary" onPress={() => void Clipboard.setStringAsync(club.invite_code)} />
                <Button
                  label="Share"
                  onPress={() => void Share.share({ message: `Join ${club.name} on Convoy with code ${club.invite_code}` })}
                />
              </Card>
            </>
          ) : null}

          {role === 'owner' ? (
            <>
              <SectionTitle>Ticket payouts</SectionTitle>
              <Card style={{ gap: Spacing.two }}>
                <ThemedText>
                  {payouts?.charges_enabled
                    ? 'Payouts are set up. You can sell tickets to events.'
                    : 'Connect a Stripe account to sell tickets to your events. Convoy keeps a small fee per ticket.'}
                </ThemedText>
                <Button label={payouts ? (payouts.charges_enabled ? 'Manage payouts' : 'Finish setup') : 'Set up payouts'} variant="secondary" onPress={payouts_} />
              </Card>
            </>
          ) : null}

          <SectionTitle>{`Members · ${members.length}`}</SectionTitle>
          <Card style={{ paddingVertical: Spacing.one }}>
            {members.slice(0, 50).map((m, i) => (
              <View key={m.profile.id} style={[styles.member, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size={36} />
                <ThemedText style={{ flex: 1, fontWeight: 600 }}>{m.profile.display_name}</ThemedText>
                {m.role !== 'member' ? (
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {m.role}
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </Card>

          {role && role !== 'owner' ? (
            <Button
              label="Leave club"
              variant="ghost"
              onPress={() =>
                Alert.alert(`Leave ${club.name}?`, undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                      await useClubs.getState().leave(club.id);
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
  hero: { padding: Spacing.four, paddingTop: Spacing.five, gap: Spacing.one },
  heroTitle: { color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: 800 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  event: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  date: { width: 48, height: 52, borderRadius: Radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  dateMonth: { color: '#fff', fontSize: 11, fontWeight: 800 },
  dateDay: { color: '#fff', fontSize: 20, lineHeight: 24, fontWeight: 800 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
});
