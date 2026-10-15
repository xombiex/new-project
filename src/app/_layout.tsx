import '@/lib/bootstrap';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useDrive } from '@/store/drive';
import { useFriends } from '@/store/friends';
import { useTrips } from '@/store/trips';

SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    if (!profile) return;
    void useTrips.getState().syncPending();
    void useFriends.getState().refresh();
    void useDrive.getState().resume();
  }, [profile]);

  return (
    <ThemeProvider
      value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.backgroundElement, primary: colors.accent } }}>
      <Stack screenOptions={{ headerTintColor: colors.accent }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="profile-setup" options={{ presentation: 'modal', title: 'Your profile', gestureEnabled: false }} />
        <Stack.Screen name="search" options={{ presentation: 'modal', title: 'Search' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
      </Stack>
    </ThemeProvider>
  );
}
