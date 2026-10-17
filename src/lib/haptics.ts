import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Small, glanceable feedback for moments a driver shouldn't have to look at the screen for.
 * No-ops on the web and wherever the device has no haptic engine.
 */
const enabled = Platform.OS !== 'web';

export const haptic = {
  /** Light tap: a friend joined, a toggle flipped. */
  tap() {
    if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Trip started or saved. */
  success() {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** Went over the speed limit. */
  warning() {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
