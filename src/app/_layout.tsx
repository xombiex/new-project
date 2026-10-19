import '@/lib/bootstrap';
import { AppState, Platform } from 'react-native';
import '@/lib/web-alert';

import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { exposeStoresForTesting, isDemo, seedDemo } from '@/lib/demo';
import { startPresence } from '@/lib/presence';
import { registerForPush, setDrivingCheck } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useClubs } from '@/store/clubs';
import { useDrive } from '@/store/drive';
import { useFriends } from '@/store/friends';
import { useInbox } from '@/store/inbox';
import { useNavigation } from '@/store/navigation';
import { useNotificationSettings } from '@/store/notification-settings';
import { usePro } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

SplashScreen.preventAutoHideAsync();

// No notification banners over the map while recording or navigating.
setDrivingCheck(() => Boolean(useTrips.getState().active) || useNavigation.getState().active);

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const { ready, session, profile, profileLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => useAuth.getState().init(), []);
  // Desktop visitors' first stop is the landing page (/about); phones go straight into the app.
  useEffect(() => {
    if (Platform.OS !== 'web' || isDemo()) return;
    try {
      const fromEmail = location.hash.includes('access_token') || location.search.includes('code=');
      if (location.pathname === '/' && !fromEmail && window.innerWidth >= 1024 && !localStorage.getItem('convoy-landing-seen')) {
        location.replace('/about');
      }
    } catch {
      // storage blocked: just show the app
    }
  }, []);

  // Screenshot demo (dev web builds only): sample data instead of an account.
  useEffect(() => {
    void seedDemo();
    void exposeStoresForTesting();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // First launch: the welcome screens (once settings have loaded from storage).
  const onboarded = useSettings((s) => s.onboarded);
  const [settingsReady, setSettingsReady] = useState(useSettings.persist.hasHydrated());
  useEffect(() => useSettings.persist.onFinishHydration(() => setSettingsReady(true)), []);
  useEffect(() => {
    if (ready && settingsReady && !onboarded && segments[0] !== 'welcome') router.push('/welcome');
  }, [ready, settingsReady, onboarded, segments, router]);

  // Signed-in users must pick a username before using social features.
  useEffect(() => {
    if (ready && onboarded && session && !profile && !profileLoading && segments[0] !== 'profile-setup') router.push('/profile-setup');
  }, [ready, onboarded, session, profile, profileLoading, segments, router]);

  // Online status for friends: a heartbeat while the app is open (if the user shares it).
  const shareOnline = useSettings((s) => s.shareOnline);
  const signedIn = Boolean(profile);
  useEffect(() => (signedIn ? startPresence(shareOnline) : undefined), [signedIn, shareOnline]);

  // Purchases follow the Supabase account (RevenueCat app user id = Supabase user id).
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (ready) void usePro.getState().identify(userId);
  }, [ready, userId]);

  // Coming back to the app: pick up team messages sent while it was closed.
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void useInbox.getState().load());
    return () => sub.remove();
  }, [signedIn]);

  // Tapping a notification opens the relevant screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as { type?: string; code?: string; event_id?: string };
      if (data.type === 'drive_invite' && data.code) router.push({ pathname: '/convoy', params: { code: data.code } });
      else if (data.type === 'friend_request' || data.type === 'friend_accepted') router.push('/friends');
      else if (data.type === 'member_joined' || data.type === 'arrived' || data.type === 'regroup') router.push('/convoy');
      else if (data.type === 'admin_message') router.push('/inbox');
      else if (data.type === 'event_reminder' && data.event_id) router.push({ pathname: '/event/[id]', params: { id: data.event_id } });
    });
    // A team message arriving while the app is open: refresh the inbox so the badge shows up.
    const got = Notifications.addNotificationReceivedListener((n) => {
      if ((n.request.content.data as { type?: string })?.type === 'admin_message') void useInbox.getState().load();
    });
    return () => {
      sub.remove();
      got.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!profile) {
      useInbox.getState().clear();
      return;
    }
    void registerForPush(profile.id);
    void useNotificationSettings.getState().load();
    // Signing in on a new device (or the web app) brings your saved drives with you.
    void useTrips.getState().syncPending().then(() => useTrips.getState().pullFromCloud());
    void useClubs.getState().loadMine();
    void useFriends.getState().refresh();
    void useInbox.getState().load();
    void useDrive.getState().resume();
  }, [profile]);

  return (
    <ThemeProvider
      value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.backgroundElement, primary: colors.accent } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerTintColor: colors.accent }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="profile-setup" options={{ presentation: 'modal', title: 'Your profile', gestureEnabled: false }} />
        <Stack.Screen
          name="search"
          options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="privacy-zones" options={{ title: 'Privacy zones' }} />
        <Stack.Screen name="share/[id]" options={{ title: 'Share drive', presentation: 'modal' }} />
        <Stack.Screen name="club/new" options={{ title: 'New club', presentation: 'modal' }} />
        <Stack.Screen name="club/[id]" options={{ title: 'Club' }} />
        <Stack.Screen name="event/new" options={{ title: 'New event', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
        <Stack.Screen name="gear" options={{ title: 'Driving gear' }} />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="car/[id]" options={{ presentation: 'modal', title: 'Car' }} />
        <Stack.Screen name="friend/[id]" options={{ title: 'Friend' }} />
        <Stack.Screen name="inbox" options={{ title: 'Inbox' }} />
        <Stack.Screen name="stripe-return" options={{ headerShown: false }} />
        <Stack.Screen name="invite" options={{ title: 'Invite to drive', presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ title: 'Report', presentation: 'formSheet', sheetAllowedDetents: [0.85, 1] }} />
      </Stack>
    </ThemeProvider>
  );
}
