import { supabase } from '@/lib/supabase';

import { classify, ok, type ProfileSummary, type Result } from './types';

export type BlockedPerson = ProfileSummary & { blockedAt: string };

/** Blocking. A block is private to the person who made it and cuts both ways. */
export interface SafetyService {
  block(userId: string): Promise<Result<void>>;
  unblock(userId: string): Promise<Result<void>>;
  blocked(): Promise<Result<BlockedPerson[]>>;
}

export const safety: SafetyService = {
  async block(userId) {
    try {
      const { error } = await supabase.rpc('block_user', { p_user: userId });
      return error ? { ok: false, error: classify(error) } : ok(undefined);
    } catch (e) {
      return { ok: false, error: classify(e) };
    }
  },

  async unblock(userId) {
    try {
      const { error } = await supabase.rpc('unblock_user', { p_user: userId });
      return error ? { ok: false, error: classify(error) } : ok(undefined);
    } catch (e) {
      return { ok: false, error: classify(e) };
    }
  },

  async blocked() {
    try {
      const { data, error } = await supabase.rpc('my_blocks');
      if (error) return { ok: false, error: classify(error) };
      type Row = ProfileSummary & { blocked_at: string };
      return ok(((data ?? []) as Row[]).map(({ blocked_at, ...p }) => ({ ...p, blockedAt: blocked_at })));
    } catch (e) {
      return { ok: false, error: classify(e) };
    }
  },
};
