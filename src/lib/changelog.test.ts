import { describe, expect, it } from 'vitest';

import { hasUnseenRelease, LATEST_RELEASE, RELEASES } from './changelog';

describe('changelog', () => {
  it('lists releases newest first with unique ids', () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('has a dated title and at least one item per release', () => {
    for (const r of RELEASES) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.id.startsWith(r.date)).toBe(true);
      expect(r.title.trim()).not.toBe('');
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) expect(item.icon && item.title && item.text).toBeTruthy();
    }
  });

  it('shows What’s new once per release', () => {
    expect(hasUnseenRelease(null)).toBe(true); // onboarded before the screen existed
    expect(hasUnseenRelease(LATEST_RELEASE!.id)).toBe(false);
    expect(hasUnseenRelease('2000-01-01')).toBe(true);
  });
});
