import { useCallback, useEffect, useRef, useState } from 'react';

import { mergePage } from '@/lib/feed';
import type { Page, Result } from '@/services/types';

export type PagedStatus = 'loading' | 'ready' | 'refreshing' | 'more' | 'error';

/**
 * A list that arrives a page at a time: first page on mount, more on request, pull to refresh.
 * `key` names what is being listed; when it changes the list starts over. An answer that comes
 * back after the list has moved on is dropped.
 */
export function usePagedList<T extends { id: string }>(key: string, fetchPage: (cursor: string | null) => Promise<Result<Page<T>>>, enabled = true) {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PagedStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const run = useRef(0);
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;

  const load = useCallback(async (mode: 'first' | 'refresh' | 'more') => {
    if (mode === 'more' && !cursor.current) return;
    const id = ++run.current;
    setStatus(mode === 'first' ? 'loading' : mode === 'refresh' ? 'refreshing' : 'more');
    const res = await fetcher.current(mode === 'more' ? cursor.current : null);
    if (id !== run.current) return;
    if (!res.ok) {
      setError(res.error.message);
      // A failed "more" or refresh keeps what's already on screen.
      setStatus(mode === 'first' ? 'error' : 'ready');
      return;
    }
    cursor.current = res.data.nextCursor;
    setError(null);
    setItems((prev) => (mode === 'more' ? mergePage(prev, res.data.items) : res.data.items));
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    cursor.current = null;
    setItems([]);
    void load('first');
    return () => {
      run.current++;
    };
  }, [key, enabled, load]);

  return {
    items,
    setItems,
    status,
    /** set after a failed load; on a failed first page `status` is 'error' too */
    error,
    hasMore: status !== 'loading' && cursor.current !== null,
    refresh: useCallback(() => load('refresh'), [load]),
    retry: useCallback(() => load('first'), [load]),
    loadMore: useCallback(() => load('more'), [load]),
  };
}
