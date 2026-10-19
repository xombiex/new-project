import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('react-native', () => ({ Platform: { select: (o: Record<string, unknown>) => o.default }, StyleSheet: { create: (s: unknown) => s, absoluteFill: {} }, Text: () => null, View: () => null }));
vi.mock('@/components/drive/speed-limit-sign', () => ({ SpeedLimitSign: () => null }));
vi.mock('../components/drive/speed-limit-sign', () => ({ SpeedLimitSign: () => null }));

const { bottomArc, ringFraction } = await import('@/components/drive/speed-dial');

describe('speed dial ring', () => {
  const limit = { value: 25, unit: 'mph' as const };
  const mph = (v: number) => v / 2.236936;

  it('fills toward the limit', () => {
    expect(ringFraction(mph(20), limit)).toBeCloseTo(0.8, 2);
    expect(ringFraction(mph(30), limit)).toBe(1);
  });

  it('shows just the slit when stopped or without a limit', () => {
    expect(ringFraction(0, limit)).toBe(0.06);
    expect(ringFraction(mph(40), null)).toBe(0.06);
  });

  it('draws a bottom-centered arc, or nothing extra for a full ring', () => {
    expect(bottomArc(0.25)).toMatch(/^M [\d.]+ [\d.]+ A 49 49 0 0 1 /);
    expect(bottomArc(0.8)).toContain(' 0 1 1 ');
    expect(bottomArc(1)).toBeNull();
  });
});
