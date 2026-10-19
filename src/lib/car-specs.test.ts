import { describe, expect, it } from 'vitest';

import { lookupPerformance } from './car-performance';
import { bodyFromText, drivetrainLabel, engineLabel, specLine, specsFromEpa, transmissionLabel } from './car-specs';

describe('car specs', () => {
  it('reads EPA drivetrain and transmission strings', () => {
    expect(drivetrainLabel('Rear-Wheel Drive')).toBe('RWD');
    expect(drivetrainLabel('4-Wheel or All-Wheel Drive')).toBe('AWD');
    expect(drivetrainLabel('Part-time 4-Wheel Drive')).toBe('4WD');
    expect(transmissionLabel('Automatic (AM-S8)')).toBe('8-speed dual-clutch');
    expect(transmissionLabel('Manual 6-spd')).toBe('6-speed manual');
    expect(transmissionLabel('Automatic (AV-S7)')).toBe('CVT');
    expect(transmissionLabel('Automatic (S10)')).toBe('10-speed automatic');
  });

  it('describes engines, electric ones too', () => {
    expect(engineLabel({ displ: '3.0', cylinders: '6', tCharger: 'T' })).toBe('3.0L turbo 6-cyl');
    expect(engineLabel({ atvType: 'EV', evMotor: '283 kW' })).toBe('Electric (283 kW)');
  });

  it('picks the right engine version', () => {
    expect(lookupPerformance('Ford', 'Mustang', 2024, { cyl: 8, displ: 5.0 })?.hp).toBe(480);
    expect(lookupPerformance('Ford', 'Mustang', 2024, { cyl: 4, displ: 2.3 })?.hp).toBe(315);
    expect(lookupPerformance('Porsche', '911 GT3 RS', 2024)?.hp).toBe(518);
    expect(lookupPerformance('Porsche', '911 Carrera', 2024)?.hp).toBe(379);
    expect(lookupPerformance('Pagani', 'Huayra', 2020)).toBeNull();
  });

  it('builds specs and a card line from an EPA record', () => {
    const s = specsFromEpa({
      id: '1',
      year: '2020',
      make: 'Porsche',
      model: '911 Carrera S',
      drive: 'Rear-Wheel Drive',
      trany: 'Automatic (AM-S8)',
      displ: '3.0',
      cylinders: '6',
      tCharger: 'T',
      fuelType1: 'Premium Gasoline',
      comb08: '20',
      VClass: 'Minicompact Cars',
    });
    expect(specLine(s)).toBe('443 hp · 0–60 3.3 s · RWD · 8-spd DCT');
    expect(s.mpgComb).toBe(20);
    expect(bodyFromText(s.vehicleClass)).toBe('sport');
    expect(bodyFromText('Standard Pickup Trucks 4WD')).toBe('pickup');
  });
});
