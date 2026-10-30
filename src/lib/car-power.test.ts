import { describe, expect, it } from 'vitest';

import fordRows from '../../public/specs/ford.json';
import hondaRows from '../../public/specs/honda.json';
import kiaRows from '../../public/specs/kia.json';
import subaruRows from '../../public/specs/subaru.json';
import toyotaRows from '../../public/specs/toyota.json';
import { combineFacts, engineFromLabel, estimateZeroToSixty, makeSlug, matchPower, type PowerRow } from './car-power';

const DATA = { ford: fordRows, honda: hondaRows, kia: kiaRows, subaru: subaruRows, toyota: toyotaRows };
const rows = (make: keyof typeof DATA) => DATA[make] as unknown as PowerRow[];

describe('matchPower, against the real EPA data', () => {
  it('finds the right engine', () => {
    const ford = rows('ford');
    expect(matchPower(ford, 'Mustang', 2018, { displ: 5, cyl: 8 })?.[4]).toBe(460);
    expect(matchPower(ford, 'Mustang', 2018, { displ: 2.3, cyl: 4 })?.[4]).toBe(310);
    expect(matchPower(rows('toyota'), 'Tacoma 4WD', 2021, { displ: 3.5, cyl: 6 })?.[4]).toBe(278);
    expect(matchPower(rows('subaru'), 'WRX', 2015, { displ: 2 })?.[4]).toBe(268);
  });

  it('takes the base car when it only knows the name', () => {
    expect(matchPower(rows('ford'), 'Mustang', 2018)?.[4]).toBe(310);
    expect(matchPower(rows('honda'), 'Civic', 2018)?.[4]).toBeLessThan(180);
  });

  it('uses the extra words in the model name', () => {
    expect(matchPower(rows('subaru'), 'WRX STI', 2015)?.[4]).toBe(305);
    expect(matchPower(rows('honda'), 'Civic Type-R', 2018)?.[4]).toBe(306);
  });

  it('finds nothing rather than something else', () => {
    expect(matchPower(rows('ford'), 'Camry', 2018)).toBeNull();
    expect(matchPower(rows('ford'), 'Mustang', 1967)).toBeNull();
    expect(matchPower(rows('ford'), 'Mustang', null)).toBeNull();
  });
});

describe('combineFacts', () => {
  it('fills all four for a well-known car', () => {
    const facts = combineFacts(matchPower(rows('ford'), 'Mustang', 2018, { displ: 5, cyl: 8 }), 'Ford', 'Mustang', 2018, { displ: 5, cyl: 8 });
    expect(facts).toEqual({ hp: 460, torque: 420, zeroToSixty: 4.3, topSpeedMph: 155 });
  });

  it('marks a calculated 0–60 as an estimate', () => {
    const facts = combineFacts(matchPower(rows('kia'), 'Soul', 2019), 'Kia', 'Soul', 2019);
    expect(facts.hp).toBeGreaterThan(100);
    expect(facts.estimated).toEqual(['zeroToSixty']);
    expect(facts.zeroToSixty).toBeGreaterThan(5);
    expect(facts.torque).toBeUndefined();
  });

  it('does not attach a V8’s torque to a smaller engine', () => {
    const row: PowerRow = [2018, 'Mustang', 3.7, 6, 300, 3800, 0];
    expect(combineFacts(row, 'Ford', 'Mustang', 2018, { cyl: 6 }).torque).not.toBe(420);
  });

  it('still answers from the known figures for cars the EPA list misses', () => {
    expect(combineFacts(null, 'Honda', 'S2000', 2005).hp).toBe(240);
    expect(combineFacts(null, 'Nobody', 'Nothing', 2005)).toEqual({});
  });
});

describe('estimateZeroToSixty', () => {
  it('is in the right place for ordinary and fast cars', () => {
    expect(estimateZeroToSixty(158, 3100, false)).toBeCloseTo(7.7, 0);
    expect(estimateZeroToSixty(518, 3500, false)).toBeCloseTo(3, 0);
  });
});

describe('helpers', () => {
  it('reads engine labels', () => {
    expect(engineFromLabel('5.0L V8')).toEqual({ displ: 5, cyl: 8 });
    expect(engineFromLabel('2.3L turbo 4-cyl')).toEqual({ displ: 2.3, cyl: 4 });
    expect(engineFromLabel(undefined)).toBeUndefined();
  });

  it('makes file names', () => {
    expect(makeSlug('Mercedes-Benz')).toBe('mercedes-benz');
    expect(makeSlug('Alfa Romeo')).toBe('alfa-romeo');
  });
});
