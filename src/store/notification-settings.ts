import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

export type NotificationPrefs = {
  friend_requests: boolean;
  drive_invites: boolean;
  drive_activity: boolean;
  club_events: boolean;
  announcements: boolean;
};

const DEFAULTS: NotificationPrefs = { friend_requests: true, drive_invites: true, drive_activity: true, club_events: true, announcements: true };

type State = {
  prefs: NotificationPrefs;
  load: () => Promise<void>;
  set: (key: keyof NotificationPrefs, on: boolean) => Promise<void>;
};

/** Stored server-side so the notify function can respect them for every device. */
export const useNotificationSettings = create<State>()((set, get) => ({
  prefs: DEFAULTS,

  load: async () => {
    const { data } = await supabase
      .from('notification_settings')
      .select('friend_requests, drive_invites, drive_activity, club_events, announcements')
      .maybeSingle();
    set({ prefs: data ?? DEFAULTS });
  },

  set: async (key, on) => {
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    if (!uid) return;
    const prefs = { ...get().prefs, [key]: on };
    set({ prefs });
    const { error } = await supabase
      .from('notification_settings')
      .upsert({ user_id: uid, ...prefs, updated_at: new Date().toISOString() });
    if (error) console.warn('Notification settings save failed', error.message);
  },
}));
