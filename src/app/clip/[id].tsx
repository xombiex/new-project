import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch } from 'react-native';

import { useClipDetails } from '@/components/clip-input';
import { ClipMaker } from '@/components/clip-maker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CLIP_TRIM_M } from '@/lib/clip-route';
import { useEntitled } from '@/store/pro';

/** A shareable vertical video of one drive. Free for everyone; the watermark is how it spreads. */
export default function ClipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const clip = useClipDetails(id);
  const pro = useEntitled('pro');
  const [watermark, setWatermark] = useState(true);

  if (!clip) return null;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <ThemedText style={styles.title}>{clip.details.title}</ThemedText>
      <ThemedText themeColor="textSecondary">
        A 14-second vertical video of this drive, ready for Reels, TikTok and Stories: your route from above, a chase behind your car, then your stats.
      </ThemedText>
      <Card style={styles.row}>
        <ThemedText style={{ flex: 1 }}>Show &quot;Tracked with Convoy&quot;</ThemedText>
        <Switch value={watermark || !pro} disabled={!pro} onValueChange={setWatermark} accessibilityLabel="Show Convoy watermark" />
      </Card>
      <ThemedText type="small" themeColor="textSecondary">
        The first and last {CLIP_TRIM_M} m of the drive and anything inside your privacy zones are left out, so your home stays off the video.
      </ThemedText>
      {clip.tooShort ? (
        <ThemedText themeColor="textSecondary">This drive is too short for a clip once the start and end are left out.</ThemedText>
      ) : (
        <ClipMaker details={clip.details} watermark={watermark || !pro} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  title: { fontSize: 26, lineHeight: 32, fontWeight: 800 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
