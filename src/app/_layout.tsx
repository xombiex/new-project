import '@/lib/bootstrap';

import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { registerForPush, setDrivingCheck } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useDrive } from '@/store/drive';
import { useFriends } from '@/store/friends';
import { useNavigation } from '@/store/navigation';
import { useNotificationSettings } from '@/store/notification-settings';
import { usePro } from '@/store/pro';
import { useTrips } from '@/store/trips';

SplashScreen.preventAutoHideAsync();

// No notification banners over the map while recording or navigating.
setDrivingCheck(() => Boolean(useTrips.getState().active) || useNavigation.getState().active);

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const { ready, session, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => useAuth.getState().init(), []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Signed-in users must pick a username before using social features.
  useEffect(() => {
    if (ready && session && !profile && segments[0] !== 'profile-setup') router.push('/profile-setup');
  }, [ready, session, profile, segments, router]);

  // Purchases follow the Supabase account (RevenueCat app user id = Supabase user id).
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (ready) void usePro.getState().identify(userId);
  }, [ready, userId]);

  // Tapping a notification opens the relevant screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as { type?: string; code?: string; event_id?: string };
      if (data.type === 'drive_invite' && data.code) router.push({ pathname: '/convoy', params: { code: data.code } });
      else if (data.type === 'friend_request' || data.type === 'friend_accepted') router.push('/friends');
      else if (data.type === 'member_joined' || data.type === 'arrived') router.push('/convoy');
      else if (data.type === 'event_reminder' && data.event_id) router.push({ pathname: '/event/[id]', params: { id: data.event_id } });
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!profile) return;
    void registerForPush(profile.id);
    void useNotificationSettings.getState().load();
    void useTrips.getState().syncPending();
    void useFriends.getState().refresh();
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
        <Stack.Screen name="search" options={{ presentation: 'modal', title: 'Search' }} />
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
        <Stack.Screen name="garage" options={{ title: 'Garage' }} />
        <Stack.Screen name="stripe-return" options={{ headerShown: false }} />
        <Stack.Screen name="invite" options={{ title: 'Invite to drive', presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ title: 'Report', presentation: 'formSheet', sheetAllowedDetents: [0.6, 1] }} />
      </Stack>
    </ThemeProvider>
  );
}
