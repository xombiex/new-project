import { describe, expect, it } from 'vitest';

import { formatDayOrdinal } from '@/lib/time';

describe('formatDayOrdinal', () => {
  const now = new Date(2026, 9, 15).getTime();
  it('adds English ordinals', () => {
    expect(formatDayOrdinal(new Date(2026, 4, 31).getTime(), now)).toBe('May 31st');
    expect(formatDayOrdinal(new Date(2026, 4, 2).getTime(), now)).toBe('May 2nd');
    expect(formatDayOrdinal(new Date(2026, 4, 13).getTime(), now)).toBe('May 13th');
    expect(formatDayOrdinal(new Date(2026, 4, 23).getTime(), now)).toBe('May 23rd');
  });
  it('shows the year for other years', () => {
    expect(formatDayOrdinal(new Date(2025, 3, 14).getTime(), now)).toBe('April 14th, 2025');
  });
});
