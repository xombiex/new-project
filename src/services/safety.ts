import { supabase } from '@/lib/supabase';

import type { ContentReportKind, ContentReportReason } from './database.types';
import { classify, ok, type ProfileSummary, type Result } from './types';

export type BlockedPerson = ProfileSummary & { blockedAt: string };

export const REPORT_REASONS: { value: ContentReportReason; label: string; hint: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying', hint: 'Insults, threats, or going after someone' },
  { value: 'dangerous', label: 'Dangerous driving', hint: 'Showing off street racing or reckless driving' },
  { value: 'inappropriate', label: 'Offensive content', hint: 'Hateful, sexual or violent content' },
  { value: 'spam', label: 'Spam or a scam', hint: 'Ads, fake accounts, repeated junk' },
  { value: 'other', label: 'Something else', hint: 'Tell us what happened' },
];

/** Blocking and reporting. A block is private to the person who made it and cuts both ways. */
export interface SafetyService {
  block(userId: string): Promise<Result<void>>;
  unblock(userId: string): Promise<Result<void>>;
  blocked(): Promise<Result<BlockedPerson[]>>;
  /** Send a person, a shared drive or a comment to the Convoy team to look at. */
  report(target: { kind: ContentReportKind; id: string }, reason: ContentReportReason, details?: string): Promise<Result<void>>;
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

  async report(target, reason, details) {
    try {
      const { error } = await supabase.rpc('report_content', { p_kind: target.kind, p_id: target.id, p_reason: reason, p_details: details?.trim() || null });
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
