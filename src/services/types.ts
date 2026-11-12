/**
 * What every service returns. Services never throw for an expected failure (offline, not allowed,
 * rate limited): the screen gets a reason it can show.
 */
export type ServiceErrorKind = 'offline' | 'auth' | 'forbidden' | 'not-found' | 'rate-limited' | 'server';

export type ServiceError = { kind: ServiceErrorKind; message: string };

export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

/** One page of a list. Pass `nextCursor` back to get the next one; null means that was the last. */
export type Page<T> = { items: T[]; nextCursor: string | null };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = (kind: ServiceErrorKind, message: string): Result<never> => ({ ok: false, error: { kind, message } });

/** What the people in a list look like: enough to draw a row. */
export type ProfileSummary = { id: string; username: string; display_name: string; avatar_color: string };

type BackendError = { message: string; code?: string; status?: number };

const FRIENDLY: Record<ServiceErrorKind, string> = {
  offline: "Can't reach Convoy. Check your connection and try again.",
  auth: 'Sign in to do that.',
  forbidden: "You can't do that.",
  'not-found': "That's no longer there.",
  'rate-limited': "You're doing that a lot. Give it a few minutes.",
  server: 'Something went wrong on our side. Try again.',
};

/** Sorts a Supabase or network error into a kind, with wording a person can read. */
export function classify(error: BackendError | Error | unknown): ServiceError {
  const e = (error ?? {}) as BackendError;
  const message = typeof e.message === 'string' ? e.message : '';
  const lower = message.toLowerCase();
  let kind: ServiceErrorKind = 'server';
  if (lower.includes('failed to fetch') || lower.includes('network request failed') || lower.includes('networkerror') || lower.includes('load failed')) kind = 'offline';
  else if (lower.includes('not authenticated') || lower.includes('jwt') || e.status === 401) kind = 'auth';
  else if (lower.includes('too many') || e.status === 429) kind = 'rate-limited';
  else if (e.code === '42501' || lower.includes('row-level security') || lower.includes('not allowed') || e.status === 403) kind = 'forbidden';
  else if (e.code === 'PGRST116' || lower.includes('not found')) kind = 'not-found';
  return { kind, message: FRIENDLY[kind] };
}
