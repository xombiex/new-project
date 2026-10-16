import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function NotFound() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two, backgroundColor: theme.background }}>
        <ThemedText style={{ fontSize: 72, lineHeight: 80, fontWeight: 900, color: theme.accent }}>404</ThemedText>
        <ThemedText type="subtitle">Wrong turn</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', marginBottom: Spacing.three }}>
          This page doesn’t exist or has moved.
        </ThemedText>
        <Button label="Back to Convoy" onPress={() => router.replace('/')} />
      </View>
    </>
  );
}
