import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/drive', () => ({}));

const { convoyStop, rosterEntries } = await import('./roster');

const member = (name: string, lat: number | null, speed: number | null, online = true, t = 1000) => ({
  profile: { display_name: name, avatar_color: '#123' },
  online,
  position: lat == null ? null : { lat, lng: 0, heading: null, speed, accuracy: 5, t },
});

describe('convoy roster', () => {
  const drive = { regroup_name: 'Wawa', regroup_lat: 0.01, regroup_lng: 0, dest_lat: 0.5, dest_lng: 0, destination_name: 'Beach' };

  it('measures to the regroup point first, then the destination', () => {
    expect(convoyStop(drive as never)?.label).toBe('Wawa');
    expect(convoyStop({ ...drive, regroup_name: null, regroup_lat: null, regroup_lng: null } as never)?.label).toBe('Beach');
    expect(convoyStop({ dest_lat: null, regroup_lat: null } as never)).toBeNull();
  });

  it('lists everyone closest to the stop first, with live speeds', () => {
    const members = { me: member('Me Myself', 0, 0), jess: member('Jess Doe', 0.009, 13.4), abby: member('Abby', 0.002, 20), lost: member('Lost', 0.005, 30, true, -999_999) };
    const out = rosterEntries(members as never, 'me', { coord: [0, 0], speed: 10 }, [0, 0.01], 1000);
    expect(out.map((e) => e.name)).toEqual(['Jess', 'Lost', 'Abby', 'You']);
    expect(out[0].speed).toBe(13.4);
    expect(Math.round(out[0].awayM!)).toBe(111);
    expect(out[1]).toMatchObject({ live: false, speed: null });
    expect(out[3]).toMatchObject({ me: true, speed: 10 });
  });
});
