import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Card, IconButton } from '@/components/ui';
import { HitTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { driveTime, postedAgo } from '@/lib/feed';
import { formatDistance, speedIn, speedUnitLabel, type Units } from '@/lib/geo';
import { formatDayOrdinal } from '@/lib/time';
import type { Activity, Audience } from '@/services/feed';
import { useLiveActivity } from '@/store/social';

import { RoutePreview } from './route-preview';

/** Who can see a shared drive, said in a few words. Shown wherever a drive is shown. */
export function audienceLabel(audience: Audience, clubName: string | null): string {
  if (audience.friends && audience.clubId) return clubName ? `Friends and ${clubName}` : 'Friends and a club';
  if (audience.clubId) return clubName ?? 'A club';
  return 'Friends';
}

/** The same, for the end of a sentence: "Share with friends and Bay Area Touge". */
export function audiencePhrase(audience: Audience, clubName: string | null): string {
  const club = clubName ?? 'a club';
  if (audience.friends && audience.clubId) return `friends and ${club}`;
  return audience.clubId ? club : 'friends';
}

export function AudienceBadge({ audience, clubName }: { audience: Audience; clubName: string | null }) {
  const theme = useTheme();
  const label = audienceLabel(audience, clubName);
  return (
    <View style={styles.audience} accessibilityLabel={`Visible to: ${label}`}>
      <MaterialCommunityIcons name={audience.clubId && !audience.friends ? 'shield-account-outline' : 'account-multiple-outline'} size={14} color={theme.textSecondary} />
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Heart with a count. Fills and bumps when you like something. */
export function LikeButton({ liked, count, onPress, disabled }: { liked: boolean; count: number; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (liked) scale.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 9 }));
  }, [liked, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: liked, disabled: Boolean(disabled) }}
      accessibilityLabel={`${liked ? 'Unlike' : 'Like'}. ${count} ${count === 1 ? 'like' : 'likes'}`}
      style={[styles.action, { opacity: disabled ? 0.45 : 1 }]}>
      <Animated.View style={style}>
        <MaterialCommunityIcons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? theme.accent : theme.textSecondary} />
      </Animated.View>
      <ThemedText type="smallBold" style={{ color: liked ? theme.accent : theme.textSecondary, fontVariant: ['tabular-nums'] }}>
        {count > 0 ? count : 'Like'}
      </ThemedText>
    </Pressable>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <ThemedText type="metric" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      <ThemedText type="label" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * One shared drive: who, when and for whom; the shape of the road with the car they took; three
 * numbers; and the like and comment buttons. `locked` is set while this person is driving.
 */
export function ActivityCard({
  activity: loaded,
  units,
  onOpen,
  onLike,
  onMenu,
  locked,
}: {
  activity: Activity;
  units: Units;
  /** opens the drive's own page; left out on that page */
  onOpen?: () => void;
  onLike: () => void;
  onMenu: () => void;
  locked?: boolean;
}) {
  const theme = useTheme();
  const activity = useLiveActivity(loaded);
  const title = activity.title ?? formatDayOrdinal(Date.parse(activity.startedAt));
  const avgMps = activity.movingS > 0 ? activity.distanceM / activity.movingS : 0;

  const body = (
    <View style={{ gap: Spacing.three }}>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="heading" numberOfLines={2}>
          {title}
        </ThemedText>
        {activity.car ? (
          <View style={styles.car}>
            <Image source={sideImage(activity.car.body, activity.car.paint)} style={styles.carImage} resizeMode="contain" accessibilityIgnoresInvertColors />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {activity.car.label}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <RoutePreview segments={activity.preview} />
      <View style={styles.figures}>
        <Figure value={formatDistance(units, activity.distanceM)} label="Distance" />
        <Figure value={driveTime(activity.movingS)} label="Drive time" />
        <Figure value={String(Math.round(speedIn(units, avgMps)))} label={`Avg ${speedUnitLabel(units)}`} />
      </View>
    </View>
  );

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.head}>
        <Avatar name={activity.author.display_name} color={activity.author.avatar_color} size={44} />
        <View style={{ flex: 1 }}>
          <ThemedText type="lead" numberOfLines={1}>
            {activity.author.display_name}
          </ThemedText>
          <View style={styles.meta}>
            <ThemedText type="caption" themeColor="textSecondary">
              {postedAgo(activity.createdAt)}
            </ThemedText>
            <AudienceBadge audience={activity.audience} clubName={activity.clubName} />
          </View>
        </View>
        <IconButton icon="dots-horizontal" label={`More options for ${title}`} onPress={onMenu} color={theme.textSecondary} />
      </View>

      {onOpen ? (
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${title} by ${activity.author.display_name}`} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          {body}
        </Pressable>
      ) : (
        body
      )}

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <LikeButton liked={activity.likedByMe} count={activity.likeCount} onPress={onLike} disabled={locked} />
        {onOpen ? (
          <Pressable
            onPress={onOpen}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel={`${activity.commentCount} ${activity.commentCount === 1 ? 'comment' : 'comments'}. Open to read or write one`}
            style={[styles.action, { opacity: locked ? 0.45 : 1 }]}>
            <MaterialCommunityIcons name="comment-outline" size={22} color={theme.textSecondary} />
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontVariant: ['tabular-nums'] }}>
              {activity.commentCount > 0 ? activity.commentCount : 'Comment'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  car: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  carImage: { width: 40, height: 22 },
  figures: { flexDirection: 'row', gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, marginTop: -Spacing.one, paddingTop: Spacing.one, marginBottom: -Spacing.two },
  action: { minHeight: HitTarget.min, minWidth: 88, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingRight: Spacing.three },
});
