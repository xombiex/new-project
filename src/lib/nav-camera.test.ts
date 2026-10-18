import { describe, expect, it } from 'vitest';

import { followZoom, pointAlong, splitRoute } from './nav-camera';
import { categoryOf, detailsFromTags } from './place-details';

describe('followZoom', () => {
  it('pulls out on fast roads and zooms in for turns', () => {
    expect(followZoom(5, null)).toBeGreaterThan(followZoom(30, null));
    expect(followZoom(30, 80)).toBe(18);
    expect(followZoom(30, 250)).toBe(17.4);
    expect(followZoom(30, 2000)).toBe(15);
  });
});

describe('splitRoute', () => {
  const g: [number, number][] = [[0, 0], [0, 1], [0, 2]];
  const c = [0, 100, 200];
  it('finds the point along the line', () => {
    expect(pointAlong(g, c, 150)).toEqual([0, 1.5]);
  });
  it('splits at the current position', () => {
    const { driven, ahead } = splitRoute(g, c, 1, 150);
    expect(driven).toEqual([[0, 0], [0, 1], [0, 1.5]]);
    expect(ahead).toEqual([[0, 1.5], [0, 2]]);
  });
});

describe('place details', () => {
  it('turns OSM tags into something readable', () => {
    expect(categoryOf({ amenity: 'fast_food' })).toBe('Fast food');
    expect(categoryOf({ shop: 'hardware' })).toBe('Hardware store');
    const d = detailsFromTags({ amenity: 'cafe', opening_hours: 'Mo-Su 07:00-19:00', 'contact:phone': '+1 813 555 0100', website: 'example.com', cuisine: 'coffee_shop;donut' });
    expect(d.website).toBe('https://example.com');
    expect(d.phone).toBe('+1 813 555 0100');
    expect(d.cuisine).toBe('Coffee shop, Donut');
    expect(d.hours?.[0]).toEqual([[420, 1140]]);
  });
});
