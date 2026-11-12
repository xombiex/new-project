import { describe, expect, it } from 'vitest';

import type { LngLat } from './geo';
import { decodeCursor, driveTime, encodeCursor, isDrivingNow, mergePage, nextCursor, postedAgo, previewForShare, previewLength, PREVIEW_MAX_POINTS, waypointsFor, withLike } from './feed';

const line = (n: number, lng0 = -122): LngLat[] => Array.from({ length: n }, (_, i) => [lng0 + i * 0.0001234567, 37 + i * 0.0000987654]);

describe('cursors', () => {
  it('round-trips a row, including a timestamp with its own punctuation', () => {
    const row = { created_at: '2026-11-12T05:08:41.536361+00:00', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(row))).toEqual({ before: row.created_at, id: row.id });
  });

  it('treats junk and nothing as "start from the top"', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor('no-separator')).toBeNull();
    expect(decodeCursor('2026|')).toBeNull();
    expect(encodeCursor(undefined)).toBeNull();
  });

  it('only offers another page after a full one', () => {
    const rows = [1, 2, 3].map((i) => ({ created_at: `t${i}`, id: `id${i}` }));
    expect(nextCursor(rows, 3)).toBe('t3|id3');
    expect(nextCursor(rows, 20)).toBeNull();
    expect(nextCursor([], 20)).toBeNull();
  });
});

describe('lists', () => {
  it('never shows the same row twice when pages overlap', () => {
    const merged = mergePage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('counts a like once and never goes below zero', () => {
    const post = { likedByMe: false, likeCount: 0 };
    const liked = withLike(post, true);
    expect(liked).toEqual({ likedByMe: true, likeCount: 1 });
    expect(withLike(liked, true)).toBe(liked);
    expect(withLike(post, false)).toBe(post);
    expect(withLike({ likedByMe: true, likeCount: 0 }, false).likeCount).toBe(0);
  });
});

describe('the route preview that gets shared', () => {
  it('thins a long drive to a sketch and keeps both ends', () => {
    const drive = line(5000);
    const [preview] = previewForShare([drive]);
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_MAX_POINTS);
    expect(preview[0][0]).toBeCloseTo(drive[0][0], 3);
    expect(preview.at(-1)![1]).toBeCloseTo(drive.at(-1)![1], 3);
    // Roughly the same length of road, so the shape still reads.
    expect(previewLength([preview]) / previewLength([drive])).toBeGreaterThan(0.95);
  });

  it('rounds coordinates to about ten metres', () => {
    const [preview] = previewForShare([line(10)]);
    for (const [lng, lat] of preview) {
      expect(String(lng).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
      expect(String(lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    }
  });

  it('keeps separate pieces separate, so a privacy zone stays a gap', () => {
    const preview = previewForShare([line(900), line(100, -121)]);
    expect(preview).toHaveLength(2);
    expect(preview[0].length).toBeGreaterThan(preview[1].length);
    expect(preview.reduce((n, s) => n + s.length, 0)).toBeLessThanOrEqual(PREVIEW_MAX_POINTS + 2);
  });

  it('shares nothing when there is nothing left to show', () => {
    expect(previewForShare([])).toEqual([]);
    expect(previewForShare([[[-122, 37]]])).toEqual([]);
  });
});

describe('following a shared route', () => {
  it('picks a few points spread along it and always ends at the end', () => {
    const drive = line(100);
    const stops = waypointsFor([drive.slice(0, 60), drive.slice(60)], 5);
    expect(stops).toHaveLength(5);
    expect(stops.at(-1)).toEqual(drive.at(-1));
    expect(stops[0]).not.toEqual(drive[0]);
  });

  it('has nothing to offer for an empty sketch', () => {
    expect(waypointsFor([])).toEqual([]);
    expect(waypointsFor([[[-122, 37]]])).toEqual([]);
  });
});

describe('locking social features for a driver', () => {
  const idle = { navigating: false, recording: false, speedMps: 0, passenger: false };

  it('locks during navigation even when stopped at a light', () => {
    expect(isDrivingNow({ ...idle, navigating: true })).toBe(true);
  });

  it('locks while recording only when the car is moving', () => {
    expect(isDrivingNow({ ...idle, recording: true, speedMps: 1 })).toBe(false);
    expect(isDrivingNow({ ...idle, recording: true, speedMps: 12 })).toBe(true);
    expect(isDrivingNow({ ...idle, recording: true, speedMps: null })).toBe(false);
  });

  it('stays open when nobody is driving, however fast the phone moves', () => {
    expect(isDrivingNow({ ...idle, speedMps: 30 })).toBe(false);
  });

  it('unlocks for someone who says they are a passenger', () => {
    expect(isDrivingNow({ navigating: true, recording: true, speedMps: 30, passenger: true })).toBe(false);
  });
});

describe('driveTime', () => {
  it('reads like something a person would say', () => {
    expect(driveTime(20)).toBe('1 min');
    expect(driveTime(52 * 60)).toBe('52 min');
    expect(driveTime(3600)).toBe('1h');
    expect(driveTime(104 * 60)).toBe('1h 44m');
  });
});

describe('postedAgo', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  it('gets less precise as time passes', () => {
    expect(postedAgo('2026-11-12T11:59:40Z', now)).toBe('Just now');
    expect(postedAgo('2026-11-12T11:15:00Z', now)).toBe('45m ago');
    expect(postedAgo('2026-11-12T07:00:00Z', now)).toBe('5h ago');
    expect(postedAgo('2026-11-09T12:00:00Z', now)).toBe('3d ago');
    expect(postedAgo('2026-10-01T12:00:00Z', now)).not.toContain('ago');
  });
});
