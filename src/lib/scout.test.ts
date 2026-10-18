import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/location', () => ({ onLocation: () => () => {} }));
vi.mock('expo-speech', () => ({ speak: () => {} }));
vi.mock('@/lib/haptics', () => ({ haptic: {} }));
vi.mock('@/store/navigation', () => ({ useNavigation: { getState: () => ({}) } }));
vi.mock('@/store/settings', () => ({ useSettings: { getState: () => ({}) } }));

const { scoutRank } = await import('@/store/cameras');

describe('scoutRank', () => {
  it('climbs from Rookie to Legend', () => {
    expect(scoutRank(0)).toMatchObject({ name: 'Rookie', next: { name: 'Spotter' } });
    expect(scoutRank(10).name).toBe('Spotter');
    expect(scoutRank(75)).toMatchObject({ name: 'Scout', weight: 1.5, next: { name: 'Ranger', min: 150 } });
    expect(scoutRank(5000)).toMatchObject({ name: 'Legend', weight: 2.5, next: null });
  });
});
