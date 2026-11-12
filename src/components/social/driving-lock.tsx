import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Display, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSocial } from '@/store/social';

/**
 * Shown in place of the feed, comments and anything else worth reading while this person is
 * driving. A passenger can say so; that lasts until the drive ends.
 */
export function DrivingLock({ what = 'The feed' }: { what?: string }) {
  const theme = useTheme();
  const setPassenger = useSocial((s) => s.setPassenger);
  return (
    <Card style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five }}>
      <MaterialCommunityIcons name="steering" size={48} color={theme.accent} />
      <ThemedText style={{ fontFamily: Display.italic, fontSize: 28, lineHeight: 32, textAlign: 'center' }}>Eyes on the road</ThemedText>
      <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 340 }}>
        {what} opens again when you stop. Likes and comments wait in your inbox.
      </ThemedText>
      <View style={{ marginTop: Spacing.two }}>
        <Button label="I'm a passenger" variant="secondary" onPress={() => setPassenger(true)} />
      </View>
    </Card>
  );
}
