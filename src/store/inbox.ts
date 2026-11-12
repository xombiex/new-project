import { create } from 'zustand';

import { decodeCursor, mergePage, nextCursor } from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import type { MessageRow } from '@/services/database.types';

export type InboxMessage = MessageRow;

const PAGE = 30;
const COLUMNS = 'id, kind, title, body, actor_id, activity_id, created_at, read_at';

type InboxState = {
  messages: InboxMessage[];
  unread: number;
  loaded: boolean;
  /** set when the newest page couldn't be fetched */
  error: string | null;
  /** more, older messages exist beyond what's loaded */
  hasMore: boolean;
  loadingMore: boolean;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  markAllRead: () => Promise<void>;
  clear: () => void;
};

let cursor: string | null = null;

function page(before: string | null) {
  const query = supabase.from('messages').select(COLUMNS).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  const at = decodeCursor(before);
  // Strictly older than the last row shown, with the id settling rows written in the same instant.
  return at ? query.or(`created_at.lt."${at.before}",and(created_at.eq."${at.before}",id.lt.${at.id})`) : query;
}

/**
 * The inbox, newest first, a page at a time: announcements from the Convoy team, and notices
 * about likes and comments on drives you've shared.
 */
export const useInbox = create<InboxState>()((set, get) => ({
  messages: [],
  unread: 0,
  loaded: false,
  error: null,
  hasMore: false,
  loadingMore: false,

  load: async () => {
    const [{ data, error }, { count }] = await Promise.all([page(null), supabase.from('messages').select('id', { count: 'exact', head: true }).is('read_at', null)]);
    if (error) {
      set({ error: "Couldn't load your inbox. Check your connection and try again.", loaded: true });
      return;
    }
    const messages = (data ?? []) as InboxMessage[];
    cursor = nextCursor(messages, PAGE);
    set({ messages, unread: count ?? messages.filter((m) => !m.read_at).length, loaded: true, error: null, hasMore: cursor !== null });
  },

  loadMore: async () => {
    if (!cursor || get().loadingMore) return;
    set({ loadingMore: true });
    const { data, error } = await page(cursor);
    if (error) {
      set({ loadingMore: false });
      return;
    }
    const older = (data ?? []) as InboxMessage[];
    cursor = nextCursor(older, PAGE);
    set((s) => ({ messages: mergePage(s.messages, older), hasMore: cursor !== null, loadingMore: false }));
  },

  markAllRead: async () => {
    if (get().unread === 0) return;
    const now = new Date().toISOString();
    set((s) => ({ unread: 0, messages: s.messages.map((m) => (m.read_at ? m : { ...m, read_at: now })) }));
    await supabase.rpc('mark_messages_read');
  },

  clear: () => {
    cursor = null;
    set({ messages: [], unread: 0, loaded: false, error: null, hasMore: false, loadingMore: false });
  },
}));
