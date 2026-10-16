import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { affiliateEnabled, GEAR, gearUrl } from '@/lib/gear';

export default function GearScreen() {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six }}>
      <ThemedText themeColor="textSecondary">Handy things for drives and convoys. Tapping opens Amazon in a browser.</ThemedText>
      {GEAR.map((cat) => (
        <View key={cat.title} style={{ gap: Spacing.two }}>
          <SectionTitle>{cat.title}</SectionTitle>
          <Card style={{ paddingVertical: Spacing.one }}>
            {cat.items.map((item, i) => (
              <Pressable
                key={item.name}
                onPress={() => void WebBrowser.openBrowserAsync(gearUrl(item.query))}
                accessibilityRole="link"
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
                  <MaterialCommunityIcons name={item.icon as 'tire'} size={22} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: 700 }}>{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.why}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={18} color={theme.textSecondary} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
      {affiliateEnabled ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          As an Amazon Associate, Convoy earns from qualifying purchases. It doesn&apos;t change what you pay.
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  icon: { width: 40, height: 40, borderRadius: Radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
});
