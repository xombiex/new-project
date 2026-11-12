import { describe, expect, it } from 'vitest';

import { classify } from './types';

describe('classify', () => {
  it('spots a dropped connection on web and on phones', () => {
    expect(classify(new TypeError('Failed to fetch')).kind).toBe('offline');
    expect(classify(new TypeError('Network request failed')).kind).toBe('offline');
  });

  it('sorts database refusals', () => {
    expect(classify({ message: 'new row violates row-level security policy', code: '42501' }).kind).toBe('forbidden');
    expect(classify({ message: 'not authenticated' }).kind).toBe('auth');
    expect(classify({ message: 'too many comments, slow down' }).kind).toBe('rate-limited');
    expect(classify({ message: 'activity not found' }).kind).toBe('not-found');
  });

  it('never shows the raw database message', () => {
    const e = classify({ message: 'duplicate key value violates unique constraint "x_pkey"', code: '23505' });
    expect(e.kind).toBe('server');
    expect(e.message).not.toContain('constraint');
  });

  it('copes with nothing at all', () => {
    expect(classify(undefined).kind).toBe('server');
  });
});
