import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** Set by the app so notification display can be muted while driving. */
let isDriving: () => boolean = () => false;

export function setDrivingCheck(fn: () => boolean) {
  isDriving = fn;
}

// While a trip or navigation is active, notifications land silently in the
// notification list instead of popping a banner over the map.
Notifications.setNotificationHandler({
  handleNotification: async () => {
    const driving = isDriving();
    return {
      shouldShowBanner: !driving,
      shouldShowList: true,
      shouldPlaySound: !driving,
      shouldSetBadge: false,
    };
  },
});

/**
 * Ask permission (once) and store this device's Expo push token for the signed-in user.
 * Needs an EAS project id (`eas init`) and a physical device; quietly does nothing otherwise.
 */
export async function registerForPush(userId: string): Promise<'ok' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push disabled: no EAS projectId (run `eas init`).');
    return 'unavailable';
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Convoy',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted ? existing.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ token, user_id: userId, platform: Platform.OS as 'ios' | 'android', updated_at: new Date().toISOString() });
  if (error) console.warn('Push token save failed', error.message);
  return 'ok';
}

/** Forget this device's token (on sign-out) so the previous account stops getting pushes here. */
export async function unregisterPush() {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // best effort
  }
}

export type NotifyRequest =
  | { type: 'friend_request' | 'friend_accepted'; to: string }
  | { type: 'drive_invite'; drive_id: string; to: string[] }
  | { type: 'member_joined' | 'arrived' | 'regroup'; drive_id: string };

/** Ask the server to notify other people. Failures are logged, never thrown (notifications are best-effort). */
export async function notify(req: NotifyRequest) {
  const { error } = await supabase.functions.invoke('notify', { body: req });
  if (error) console.warn('Notify failed', req.type, error.message);
}
