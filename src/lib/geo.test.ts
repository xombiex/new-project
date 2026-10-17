import { describe, expect, it } from 'vitest';

import { speedLabel } from './geo';

describe('speedLabel', () => {
  it('formats live speed for the bubble', () => {
    expect(speedLabel('imperial', 16.1, false)).toBe('36 MPH');
    expect(speedLabel('metric', 16.1, false)).toBe('58 KM/H');
  });
  it('hides when stopped, unknown or stale', () => {
    expect(speedLabel('imperial', 0.4, false)).toBeUndefined();
    expect(speedLabel('imperial', null, false)).toBeUndefined();
    expect(speedLabel('imperial', 20, true)).toBeUndefined();
  });
});
