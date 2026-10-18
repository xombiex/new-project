import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

export type InboxMessage = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type InboxState = {
  messages: InboxMessage[];
  unread: number;
  loaded: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
  clear: () => void;
};

/** Messages from the Convoy team (sent from the admin portal), newest first. */
export const useInbox = create<InboxState>()((set, get) => ({
  messages: [],
  unread: 0,
  loaded: false,

  load: async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, title, body, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return;
    const messages = (data ?? []) as InboxMessage[];
    set({ messages, unread: messages.filter((m) => !m.read_at).length, loaded: true });
  },

  markAllRead: async () => {
    if (get().unread === 0) return;
    const now = new Date().toISOString();
    set((s) => ({ unread: 0, messages: s.messages.map((m) => (m.read_at ? m : { ...m, read_at: now })) }));
    await supabase.rpc('mark_messages_read');
  },

  clear: () => set({ messages: [], unread: 0, loaded: false }),
}));
