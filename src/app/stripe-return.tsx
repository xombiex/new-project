import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const MESSAGES: Record<string, string> = {
  subscribed: 'You’re all set. Your plan unlocks in a few seconds.',
  portal: 'Subscription updated.',
  paid: 'Ticket confirmed. It can take a few seconds to show up.',
  cancel: 'Checkout cancelled. No charge was made.',
  return: 'Stripe is verifying your details. You can sell tickets once that’s done.',
  refresh: 'That link expired. Open the club and tap “Finish setup” again.',
};

/** Landing spot for convoy://stripe-return when the system opens the app instead of the auth session. */
export default function StripeReturn() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const theme = useTheme();
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 2500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: theme.background }}>
      <ThemedText style={{ textAlign: 'center', fontSize: 18 }}>{MESSAGES[status ?? ''] ?? 'Back in Convoy.'}</ThemedText>
    </View>
  );
}
