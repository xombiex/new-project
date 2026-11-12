import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Notice, Skeleton } from '@/components/ui';
import { HitTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feed, type Audience } from '@/services/feed';
import { pickPhoto } from '@/services/photos';
import { sharedRoute, shareDrive } from '@/services/share-drive';
import { useAuth } from '@/store/auth';
import { useClubs } from '@/store/clubs';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';
import type { SavedTrip } from '@/store/trips';

import { audienceLabel, audiencePhrase, DrivePhoto } from './activity-card';
import { RoutePreview } from './route-preview';

const same = (a: Audience, b: Audience) => a.friends === b.friends && a.clubId === b.clubId;

/**
 * On a drive's own page: choose who sees it in the feed. Private until you say otherwise, and it
 * shows exactly the piece of road other people will get.
 */
export function ShareDriveCard({ trip }: { trip: SavedTrip }) {
  const theme = useTheme();
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const clubs = useClubs((s) => s.mine);
  const zones = useSettings((s) => s.privacyZones);
  const autoShare = useSettings((s) => s.autoShare);
  const setAutoShare = useSettings((s) => s.setAutoShare);

  /** undefined: still checking. null: not shared. */
  const [shared, setShared] = useState<{ id: string; audience: Audience; photoPath: string | null } | null | undefined>(undefined);
  const pro = useEntitled('pro');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [audience, setAudience] = useState<Audience>({ friends: true, clubId: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const route = useMemo(() => sharedRoute(trip.path, zones), [trip.path, zones]);

  useEffect(() => {
    if (!profile) return;
    let live = true;
    void feed.forTrip(trip.id).then((res) => {
      if (!live) return;
      // Can't tell (offline): treat as not shared, and sharing again just updates it.
      const current = res.ok ? res.data : null;
      setShared(current);
      if (current) setAudience(current.audience);
    });
    return () => {
      live = false;
    };
  }, [trip.id, profile]);

  if (!profile) {
    return (
      <Card style={{ gap: Spacing.two }}>
        <ThemedText type="heading">Share with friends</ThemedText>
        <ThemedText themeColor="textSecondary">Sign in to put this drive in your friends&apos; feed. It stays private until you choose to share it.</ThemedText>
        <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }

  async function share() {
    setBusy(true);
    setError(null);
    const res = await shareDrive(trip, audience);
    setBusy(false);
    if (res.ok) setShared({ id: res.data.id, audience, photoPath: shared?.photoPath ?? null });
    else setError(res.error.message);
  }

  /** Add, change (pick again) or remove (null) the photo on the shared drive. */
  async function changePhoto(remove: boolean) {
    if (!shared) return;
    if (!pro) return router.push('/paywall');
    setError(null);
    try {
      const picked = remove ? null : await pickPhoto();
      if (!remove && !picked) return;
      setPhotoBusy(true);
      const res = await feed.setPhoto(shared.id, picked, shared.photoPath);
      if (res.ok) setShared({ ...shared, photoPath: res.data });
      else setError(res.error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function stop() {
    if (!shared) return;
    const before = shared;
    // Gone at once; back again if the server says no.
    setShared(null);
    setError(null);
    const res = await feed.unshare(before.id);
    if (!res.ok) {
      setShared(before);
      setError(res.error.message);
    }
  }

  const nobody = !audience.friends && !audience.clubId;
  const clubName = clubs.find((c) => c.id === (shared?.audience.clubId ?? audience.clubId))?.name ?? null;

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.head}>
        <MaterialCommunityIcons name={shared ? 'account-eye-outline' : 'lock-outline'} size={24} color={shared ? theme.success : theme.textSecondary} />
        <View style={{ flex: 1 }}>
          <ThemedText type="heading">{shared ? 'Shared' : 'Private'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {shared === undefined ? 'Checking…' : shared ? `Visible to: ${audienceLabel(shared.audience, clubName)}` : 'Only you can see this drive.'}
          </ThemedText>
        </View>
      </View>

      {route.tooShort ? (
        <Notice tone="info" icon="shield-lock-outline">
          This drive is too short to share. Both ends of every shared route are cut off for privacy, and nothing would be left.
        </Notice>
      ) : shared === undefined ? (
        <Skeleton height={120} />
      ) : (
        <>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="label" themeColor="textSecondary">
              What other people see
            </ThemedText>
            <RoutePreview segments={route.preview} height={120} />
            <ThemedText type="small" themeColor="textSecondary">
              The first and last 250 m are cut off and your privacy zones are left out. Distance, drive time, average speed and your car are shown. Top speed is not.
            </ThemedText>
          </View>

          <View style={{ gap: Spacing.one }}>
            <View style={styles.row}>
              <MaterialCommunityIcons name="account-multiple-outline" size={22} color={theme.text} />
              <ThemedText style={{ flex: 1, fontWeight: 700 }}>Friends</ThemedText>
              <Switch value={audience.friends} onValueChange={(friends) => setAudience({ ...audience, friends })} trackColor={{ true: theme.accent }} accessibilityLabel="Share with friends" />
            </View>
            {clubs.length > 0 ? (
              <View style={{ gap: Spacing.two }}>
                <View style={styles.row}>
                  <MaterialCommunityIcons name="shield-account-outline" size={22} color={theme.text} />
                  <ThemedText style={{ flex: 1, fontWeight: 700 }}>A club</ThemedText>
                </View>
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {[{ id: null as string | null, name: 'None' }, ...clubs].map((c) => {
                    const selected = audience.clubId === c.id;
                    return (
                      <Pressable
                        key={c.id ?? 'none'}
                        onPress={() => setAudience({ ...audience, clubId: c.id })}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={c.id ? `Share with ${c.name}` : 'No club'}
                        style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.backgroundSelected }]}>
                        <ThemedText type="smallBold" numberOfLines={1} style={{ color: selected ? theme.accentText : theme.text }}>
                          {c.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {shared ? (
            <View style={{ gap: Spacing.two }}>
              <ThemedText type="label" themeColor="textSecondary">
                Photo
              </ThemedText>
              <DrivePhoto path={shared.photoPath} height={160} />
              <Button
                label={shared.photoPath ? 'Change photo' : pro ? 'Add a photo' : 'Add a photo (Pro)'}
                variant="secondary"
                icon={<MaterialCommunityIcons name={pro ? 'image-plus' : 'lock-outline'} size={20} color={theme.text} />}
                onPress={() => void changePhoto(false)}
                loading={photoBusy}
              />
              {shared.photoPath ? <Button label="Remove photo" variant="ghost" onPress={() => void changePhoto(true)} /> : null}
              <ThemedText type="small" themeColor="textSecondary">
                {pro ? 'One photo per drive. Where it was taken is stripped out before it uploads.' : 'A photo on a shared drive is part of Convoy Pro, which pays for storing it.'}
              </ThemedText>
            </View>
          ) : null}

          {error ? <Notice tone="danger">{error}</Notice> : null}

          {shared ? (
            <View style={{ gap: Spacing.two }}>
              {!same(shared.audience, audience) && !nobody ? <Button label="Save changes" onPress={() => void share()} loading={busy} /> : null}
              <Button label="Stop sharing" variant={nobody ? 'danger' : 'secondary'} onPress={() => void stop()} />
              <Button label="See it in the feed" variant="ghost" onPress={() => router.push({ pathname: '/activity/[id]', params: { id: shared.id } })} />
            </View>
          ) : (
            <Button label={nobody ? 'Choose who sees it' : `Share with ${audiencePhrase(audience, clubs.find((c) => c.id === audience.clubId)?.name ?? null)}`} onPress={() => void share()} loading={busy} disabled={nobody} />
          )}

          <View style={[styles.row, styles.auto, { borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }}>Share new drives automatically</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Each drive you finish goes to your friends, trimmed the same way.
              </ThemedText>
            </View>
            <Switch value={autoShare} onValueChange={setAutoShare} trackColor={{ true: theme.accent }} accessibilityLabel="Share new drives with friends automatically" />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: { minHeight: HitTarget.min, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: 40, maxWidth: 220, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.pill },
  auto: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
});
