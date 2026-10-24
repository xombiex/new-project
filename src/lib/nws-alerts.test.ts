import { describe, expect, it } from 'vitest';

import { nwsIcon, pickAlert, worse } from './nws-alerts';
import { radarTiles } from '../components/map/overlays';

const feature = (event: string, severity: string, status = 'Actual') => ({
  properties: { id: event, event, headline: `${event} until 6 PM`, severity, status, instruction: 'Slow down.', description: 'Snow.', areaDesc: 'Denver', ends: null, expires: '2026-10-24T18:00:00Z' },
});

describe('NWS alerts', () => {
  it('picks the most serious actual alert and skips minor ones and tests', () => {
    const a = pickAlert([feature('Special Weather Statement', 'Minor'), feature('Wind Advisory', 'Moderate'), feature('Winter Storm Warning', 'Severe'), feature('Tornado Warning', 'Extreme', 'Test')], 'here');
    expect(a?.event).toBe('Winter Storm Warning');
    expect(a?.ends).toBe('2026-10-24T18:00:00Z'); // falls back to expires
    expect(pickAlert([feature('Special Weather Statement', 'Minor')], 'here')).toBeNull();
  });

  it('prefers the worse alert, and where you are on a tie', () => {
    const here = pickAlert([feature('Wind Advisory', 'Moderate')], 'here');
    const there = pickAlert([feature('Blizzard Warning', 'Severe')], 'destination');
    expect(worse(here, there)?.where).toBe('destination');
    expect(worse(here, pickAlert([feature('Dense Fog Advisory', 'Moderate')], 'destination'))?.where).toBe('here');
    expect(worse(null, here)).toBe(here);
  });

  it('matches icons to events', () => {
    expect(nwsIcon('Winter Storm Warning')).toBe('weather-snowy-heavy');
    expect(nwsIcon('Flash Flood Warning')).toBe('home-flood');
    expect(nwsIcon('Red Flag Warning')).toBe('fire');
    expect(nwsIcon('Air Quality Alert')).toBe('alert');
  });

  it('asks for a fresh radar sweep every five minutes', () => {
    const t = Date.UTC(2026, 9, 24, 12, 0, 0);
    expect(radarTiles(t)).toEqual(radarTiles(t + 60_000));
    expect(radarTiles(t)).not.toEqual(radarTiles(t + 5 * 60_000));
  });
});
