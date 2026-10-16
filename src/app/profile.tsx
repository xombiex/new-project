import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, SectionTitle, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GLOW_PRESETS, type GlowPreset } from '@/lib/glow';
import { MAP_THEMES } from '@/lib/map-style';
import { useAuth } from '@/store/auth';
import { useEntitled, usePro, type Entitlement } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

type PermissionSummary = { foreground: boolean; background: boolean };

const MANAGE_SUBSCRIPTIONS = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const settings = useSettings();
  const pro = useEntitled('pro');
  const cosmetics = useEntitled('cosmetics');
  const club = useEntitled('club');
  const { simulated, setSimulated } = usePro();
  const unsynced = useTrips((s) => s.history.filter((t) => !t.synced).length);
  const [perm, setPerm] = useState<PermissionSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()])
        .then(([fg, bg]) => setPerm({ foreground: fg.granted, background: bg.granted }))
        .catch(() => setPerm(null));
    }, [])
  );

  /** Premium look options open the paywall instead of applying when locked. */
  function pickGlow(g: GlowPreset) {
    if (GLOW_PRESETS[g].premium && !cosmetics) router.push({ pathname: '/paywall', params: { offering: 'cosmetics' } });
    else settings.setGlow(g);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {profile ? (
        <Card style={styles.row}>
          <Avatar name={profile.display_name} color={profile.avatar_color} size={60} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 20, fontWeight: 800 }}>{profile.display_name}</ThemedText>
            <ThemedText themeColor="textSecondary">@{profile.username}</ThemedText>
          </View>
          <Button label="Edit" variant="secondary" onPress={() => router.push('/profile-setup')} />
        </Card>
      ) : (
        <Card style={{ gap: Spacing.three }}>
          <ThemedText style={{ fontSize: 20, fontWeight: 800 }}>Not signed in</ThemedText>
          <ThemedText themeColor="textSecondary">
            The speedometer and trip recording work offline. Sign in to back up trips, add friends and join group drives.
          </ThemedText>
          <Button label="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </Card>
      )}

      <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button">
        <Card style={[styles.row, { borderColor: pro ? theme.speed : theme.border }]}>
          <View style={[styles.proBadge, { backgroundColor: theme.speed }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 800, fontSize: 17 }}>{pro ? 'Convoy Pro' : 'Upgrade to Convoy Pro'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {pro ? 'Thanks for supporting Convoy!' : 'Full stats, bigger convoys, replays, exports & styles'}
            </ThemedText>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
        </Card>
      </Pressable>
      {pro || cosmetics || club ? (
        <Button label="Manage subscription" variant="ghost" onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS!)} />
      ) : null}

      <SectionTitle>Appearance</SectionTitle>
      <Segmented
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={settings.appearance}
        onChange={settings.setAppearance}
      />

      <SectionTitle>Route glow</SectionTitle>
      <View style={styles.swatches}>
        {(Object.keys(GLOW_PRESETS) as GlowPreset[]).map((g) => {
          const p = GLOW_PRESETS[g];
          const selected = settings.glow === g;
          const locked = p.premium && !cosmetics;
          return (
            <Pressable
              key={g}
              onPress={() => pickGlow(g)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label} glow${locked ? ', locked' : ''}`}
              accessibilityState={{ selected }}
              style={styles.swatchWrap}>
              <View style={[styles.swatch, { backgroundColor: p.dark.glow, borderColor: selected ? theme.text : 'transparent' }]}>
                <View style={[styles.swatchCore, { backgroundColor: p.dark.core }]} />
                {locked ? <MaterialCommunityIcons name="lock" size={14} color="#fff" style={styles.lock} /> : null}
              </View>
              <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                {p.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>Map style</SectionTitle>
      <View style={styles.chips}>
        {MAP_THEMES.map((m) => {
          const selected = settings.mapTheme === m.value;
          const locked = m.premium && !cosmetics;
          return (
            <Pressable
              key={m.value}
              onPress={() =>
                locked
                  ? router.push({ pathname: '/paywall', params: { offering: 'cosmetics' } })
                  : settings.setMapTheme(m.value)
              }
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.accent : theme.backgroundElement, borderColor: selected ? theme.accent : theme.border },
              ]}>
              {locked ? <MaterialCommunityIcons name="lock" size={14} color={theme.textSecondary} /> : null}
              <ThemedText type="smallBold" style={{ color: selected ? theme.accentText : theme.text }}>
                {m.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>Units</SectionTitle>
      <Segmented
        options={[
          { value: 'imperial', label: 'mph · miles' },
          { value: 'metric', label: 'km/h · km' },
        ]}
        value={settings.units}
        onChange={settings.setUnits}
      />

      <SectionTitle>Driving</SectionTitle>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>Keep screen on while recording</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Uses more battery. Mount your phone; don&apos;t handle it while driving.
            </ThemedText>
          </View>
          <Switch value={settings.keepScreenOn} onValueChange={settings.setKeepScreenOn} />
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>Spoken road report alerts</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Hear about crashes, hazards and closures reported ahead.
            </ThemedText>
          </View>
          <Switch value={settings.reportAlerts} onValueChange={settings.setReportAlerts} />
        </View>
      </Card>

      <SectionTitle>Location access</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <PermissionRow label="While using the app" granted={perm?.foreground} />
        <PermissionRow label="In the background (trips & group drives)" granted={perm?.background} />
        {perm && !perm.background ? (
          <Button label="Open system settings" variant="secondary" onPress={() => void Linking.openSettings()} />
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Convoy only uses background location while a trip is recording, you are sharing with a group drive, or
          automatic drive detection is on, and a notification is always shown when it does.
        </ThemedText>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Pressable onPress={() => router.push('/privacy-zones')} accessibilityRole="button">
        <Card style={styles.row}>
          <MaterialCommunityIcons name="shield-home-outline" size={24} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>Privacy zones</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {settings.privacyZones.length
                ? `${settings.privacyZones.length} zone${settings.privacyZones.length === 1 ? '' : 's'} hidden from shared routes`
                : 'Hide your home or work from shared routes'}
            </ThemedText>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
        </Card>
      </Pressable>
      <Card style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">
          • Group drive positions are sent live to drive members only and are not stored on our servers.{'\n'}• Friends
          see a single last-known position, only while you choose to share, and it is deleted when you stop.{'\n'}• Trips
          are stored on your phone and, when signed in, in your private account.{'\n'}• We never sell your location data.
        </ThemedText>
        {unsynced > 0 && session ? (
          <ThemedText type="small" style={{ color: theme.warning }}>
            {unsynced} trip{unsynced === 1 ? '' : 's'} waiting to back up.
          </ThemedText>
        ) : null}
      </Card>

      {__DEV__ ? (
        <>
          <SectionTitle>Developer: simulate purchases</SectionTitle>
          <Card style={{ gap: Spacing.three }}>
            {(['pro', 'cosmetics', 'club'] as Entitlement[]).map((e) => (
              <View key={e} style={styles.row}>
                <ThemedText style={{ flex: 1 }}>{e}</ThemedText>
                <Switch value={simulated.includes(e)} onValueChange={(on) => setSimulated(e, on)} />
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              Unlocks features on this device only. Server-enforced limits (e.g. drive size) still use real purchases.
            </ThemedText>
          </Card>
        </>
      ) : null}

      {session ? <Button label="Sign out" variant="ghost" onPress={() => void signOut()} /> : null}

      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Map data © OpenStreetMap contributors · Tiles by OpenFreeMap
      </ThemedText>
    </ScrollView>
  );
}

function PermissionRow({ label, granted }: { label: string; granted: boolean | undefined }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={granted ? 'check-circle' : 'close-circle-outline'}
        size={22}
        color={granted ? theme.success : theme.textSecondary}
      />
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {granted == null ? '…' : granted ? 'Allowed' : 'Off'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  proBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatchWrap: { alignItems: 'center', gap: Spacing.one },
  swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  swatchCore: { width: 14, height: 14, borderRadius: 7 },
  lock: { position: 'absolute', bottom: 2, right: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
