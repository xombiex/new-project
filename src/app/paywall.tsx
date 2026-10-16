import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LegalLinks } from '@/components/legal-links';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchWebPlans, formatPrice, type WebPlan, type WebPlanId } from '@/lib/payments';
import { fetchPackages, purchasesAvailable, type PaywallPackage } from '@/lib/purchases';
import { useAuth } from '@/store/auth';
import { useEntitled, usePro, type Entitlement } from '@/store/pro';

type Offering = 'default' | 'clubs' | 'cosmetics';

/** Stripe web plans offered for each paywall. */
const WEB_PLANS: Record<Offering, WebPlanId[]> = {
  default: ['pro_yearly', 'pro_monthly'],
  clubs: ['clubs_monthly'],
  cosmetics: ['style_pack'],
};

/**
 * Show card checkout (Stripe, on the web) when store billing isn't configured, or when
 * EXPO_PUBLIC_WEB_CHECKOUT=1. Check current App Store / Google Play rules for your
 * storefronts before enabling it alongside in-app purchases.
 */
const WEB_CHECKOUT = !purchasesAvailable || process.env.EXPO_PUBLIC_WEB_CHECKOUT === '1';

const COPY: Record<Offering, { entitlement: Entitlement; title: string; tagline: string; features: [string, string][] }> = {
  default: {
    entitlement: 'pro',
    title: 'Convoy Pro',
    tagline: 'More from every drive.',
    features: [
      ['chart-bar', 'Full stats: monthly and yearly charts and personal records'],
      ['car-multiple', 'Host group drives of up to 50 people (free: 6)'],
      ['play-circle-outline', 'Trip replay: watch any drive play back on the map'],
      ['file-export-outline', 'Export trips as GPX for other apps'],
      ['palette-outline', 'All glow colors, map themes and vehicle icons'],
      ['card-account-details-star-outline', 'Premium share card styles'],
    ],
  },
  clubs: {
    entitlement: 'club',
    title: 'Convoy Clubs',
    tagline: 'Run your car club on Convoy.',
    features: [
      ['account-group', 'A permanent club with your name and colors'],
      ['calendar-star', 'Schedule drives and meets with RSVPs'],
      ['ticket-outline', 'Sell tickets to events (Stripe payouts)'],
      ['flag-checkered', 'Start club drives in one tap, no codes needed'],
      ['star-outline', 'Includes everything in Convoy Pro'],
    ],
  },
  cosmetics: {
    entitlement: 'cosmetics',
    title: 'Style Pack',
    tagline: 'One-time unlock. Yours forever.',
    features: [
      ['fire', 'Glow colors: Ice, Toxic, Violet, Gold'],
      ['map-outline', 'Map themes: Midnight, Streets, Bright'],
      ['motorbike', 'Vehicle icons on the convoy map'],
    ],
  },
};

function periodLabel(period: string | null) {
  if (!period) return 'one-time';
  if (period === 'P1M') return 'per month';
  if (period === 'P1Y') return 'per year';
  if (period === 'P1W') return 'per week';
  return period;
}

export default function PaywallScreen() {
  const params = useLocalSearchParams<{ offering?: Offering }>();
  const offering: Offering = params.offering && params.offering in COPY ? params.offering : 'default';
  const copy = COPY[offering];
  const theme = useTheme();
  const router = useRouter();
  const signedIn = useAuth((s) => Boolean(s.profile));
  const owned = useEntitled(copy.entitlement);
  const { purchase, restore, setSimulated } = usePro();
  const [packages, setPackages] = useState<PaywallPackage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webPlans, setWebPlans] = useState<Partial<Record<WebPlanId, WebPlan>> | null>(null);
  const [webBusy, setWebBusy] = useState<WebPlanId | null>(null);

  useEffect(() => {
    if (WEB_CHECKOUT) void fetchWebPlans().then(setWebPlans);
  }, []);

  async function onBuyWeb(plan: WebPlanId) {
    setWebBusy(plan);
    setError(await usePro.getState().buyOnWeb(plan));
    setWebBusy(null);
  }

  useEffect(() => {
    fetchPackages(offering)
      .then((p) => {
        setPackages(p);
        // Preselect the yearly plan when there is one (best value).
        setSelected((p.find((x) => x.period === 'P1Y') ?? p[0])?.id ?? null);
      })
      .catch((e) => {
        setPackages([]);
        setError(e instanceof Error ? e.message : 'Could not load prices');
      });
  }, [offering]);

  async function onBuy() {
    if (!selected) return;
    setBusy(true);
    setError(await purchase(selected));
    setBusy(false);
  }

  async function onRestore() {
    setBusy(true);
    setError(await restore());
    setBusy(false);
  }

  return (
    <>
      <Stack.Screen options={{ title: '', headerTransparent: true }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: theme.speed }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={34} color="#fff" />
          </View>
          <ThemedText style={styles.title}>{copy.title}</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ fontSize: 17 }}>
            {copy.tagline}
          </ThemedText>
        </View>

        <Card style={{ gap: Spacing.three }}>
          {copy.features.map(([icon, text]) => (
            <View key={text} style={styles.feature}>
              <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color={theme.accent} />
              <ThemedText style={{ flex: 1 }}>{text}</ThemedText>
            </View>
          ))}
        </Card>

        {owned ? (
          <Card style={{ alignItems: 'center', gap: Spacing.two }}>
            <MaterialCommunityIcons name="check-decagram" size={32} color={theme.success} />
            <ThemedText style={{ fontWeight: 700 }}>You have {copy.title}</ThemedText>
            <Button label="Done" variant="secondary" onPress={() => router.back()} />
          </Card>
        ) : !signedIn ? (
          <Card style={{ gap: Spacing.two }}>
            <ThemedText>Sign in first so your purchase follows you to any device.</ThemedText>
            <Button label="Sign in" onPress={() => router.push('/sign-in')} />
          </Card>
        ) : WEB_CHECKOUT && webPlans && WEB_PLANS[offering].some((p) => webPlans[p]) ? (
          <View style={{ gap: Spacing.two }}>
            {WEB_PLANS[offering].map((id) => {
              const p = webPlans[id];
              if (!p) return null;
              const per = p.interval ? `/${p.interval === 'year' ? 'yr' : 'mo'}` : ' once';
              const trial = offering === 'default';
              return (
                <Button
                  key={id}
                  size="lg"
                  variant={id === 'pro_monthly' ? 'secondary' : 'primary'}
                  loading={webBusy === id}
                  disabled={webBusy !== null}
                  label={`${trial ? 'Try 7 days free, then ' : ''}${formatPrice(p.amount, p.currency)}${per}`}
                  onPress={() => void onBuyWeb(id)}
                />
              );
            })}
            {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Secure checkout by Stripe. Cancel anytime from Profile → Manage subscription; you keep access until the end of the
              period.
            </ThemedText>
          </View>
        ) : !purchasesAvailable ? (
          <Card style={{ gap: Spacing.two }}>
            <ThemedText style={{ fontWeight: 700 }}>Purchases aren&apos;t set up yet</ThemedText>
            <ThemedText themeColor="textSecondary">
              Add the RevenueCat keys (see README) and create the products in App Store Connect and Google Play.
            </ThemedText>
            {__DEV__ ? (
              <Button
                label={`Simulate ${copy.title} (dev only)`}
                variant="secondary"
                onPress={() => setSimulated(copy.entitlement, true)}
              />
            ) : null}
          </Card>
        ) : packages === null ? (
          <ActivityIndicator color={theme.accent} />
        ) : packages.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {error ?? 'No options available right now. Try again later.'}
          </ThemedText>
        ) : (
          <View style={{ gap: Spacing.two }}>
            {packages.map((p) => {
              const isSel = p.id === selected;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelected(p.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSel }}
                  style={[
                    styles.option,
                    { borderColor: isSel ? theme.accent : theme.border, backgroundColor: theme.backgroundElement },
                  ]}>
                  <MaterialCommunityIcons
                    name={isSel ? 'radiobox-marked' : 'radiobox-blank'}
                    size={22}
                    color={isSel ? theme.accent : theme.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: 700 }}>{p.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {p.price} {periodLabel(p.period)}
                    </ThemedText>
                  </View>
                  {p.period === 'P1Y' ? (
                    <View style={[styles.best, { backgroundColor: theme.speed }]}>
                      <ThemedText type="smallBold" style={{ color: '#fff' }}>
                        Best value
                      </ThemedText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
            <Button label="Continue" size="lg" loading={busy} disabled={!selected} onPress={onBuy} />
            <Button label="Restore purchases" variant="ghost" disabled={busy} onPress={onRestore} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Subscriptions renew automatically until cancelled. Cancel in your App Store or Google Play settings (or
              Profile → Manage subscription for web purchases) at least 24 hours before renewal to avoid being charged.
            </ThemedText>
            <LegalLinks />
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingTop: 96, gap: Spacing.four },
  hero: { alignItems: 'center', gap: Spacing.two },
  badge: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  title: { fontSize: 32, lineHeight: 38, fontWeight: 800 },
  feature: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  best: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.pill },
});
