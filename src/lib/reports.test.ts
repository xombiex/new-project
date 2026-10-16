import { describe, expect, it } from 'vitest';

import { alertDistance, reportsAhead, type RoadReport } from '@/lib/reports';

const rep = (id: string, lat: number, lng = -122): RoadReport => ({
  id,
  type: 'accident',
  lat,
  lng,
  created_at: '',
  expires_at: '',
  confirms: 0,
  dismisses: 0,
  mine: false,
  my_vote: null,
});

describe('reportsAhead', () => {
  const me: [number, number] = [-122, 37];
  const reports = [rep('ahead-near', 37.003), rep('ahead-far', 37.03), rep('behind', 36.997), rep('side', 37, -121.995)];

  it('finds reports in front of the driver within the alert distance', () => {
    const ahead = reportsAhead(reports, me, 0, 25); // heading north at ~56 mph
    expect(ahead.map((a) => a.report.id)).toEqual(['ahead-near']);
    expect(ahead[0].distanceM).toBeCloseTo(334, -1);
  });

  it('ignores everything when heading is unknown or nearly stopped', () => {
    expect(reportsAhead(reports, me, null, 25)).toEqual([]);
    expect(reportsAhead(reports, me, 0, 1)).toEqual([]);
  });

  it('turns to face a report beside the road', () => {
    expect(reportsAhead(reports, me, 90, 25).map((a) => a.report.id)).toEqual(['side']);
  });

  it('scales warning distance with speed', () => {
    expect(alertDistance(5)).toBe(300);
    expect(alertDistance(30)).toBe(1350);
    expect(alertDistance(60)).toBe(1500);
  });
});
