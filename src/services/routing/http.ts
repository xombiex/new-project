import { RoutingError } from './types';

/** A public server that hangs is as bad as one that's down: give up and try the next one. */
export const REQUEST_TIMEOUT_MS = 12_000;

function deviceOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * GET some JSON from a map service. Every way this can go wrong comes out as a RoutingError, so
 * callers can tell "you're offline" from "their server is down" from "you cancelled".
 */
export async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  if (signal?.aborted) throw new RoutingError('aborted');
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new RoutingError('unavailable', `HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof RoutingError) throw e;
    if (signal?.aborted) throw new RoutingError('aborted');
    if (timedOut) throw new RoutingError('unavailable', 'timed out');
    throw new RoutingError(deviceOffline() ? 'offline' : 'unavailable', e instanceof Error ? e.message : undefined);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
