import type { Units } from '@/lib/geo';

// The sums behind a car's service and fuel log. Everything is stored in kilometres and litres;
// what people type and read follows their units setting.

export const KM_PER_MILE = 1.609344;
export const LITRES_PER_GALLON = 3.785411784;

export type MaintenanceKind = 'oil' | 'tires' | 'brakes' | 'battery' | 'fluids' | 'filters' | 'inspection' | 'repair' | 'upgrade' | 'other';

export const MAINTENANCE_KINDS: { value: MaintenanceKind; label: string; icon: string }[] = [
  { value: 'oil', label: 'Oil change', icon: 'oil' },
  { value: 'tires', label: 'Tires', icon: 'tire' },
  { value: 'brakes', label: 'Brakes', icon: 'car-brake-alert' },
  { value: 'battery', label: 'Battery', icon: 'car-battery' },
  { value: 'fluids', label: 'Fluids', icon: 'water-outline' },
  { value: 'filters', label: 'Filters', icon: 'air-filter' },
  { value: 'inspection', label: 'Inspection', icon: 'clipboard-check-outline' },
  { value: 'repair', label: 'Repair', icon: 'wrench-outline' },
  { value: 'upgrade', label: 'Upgrade', icon: 'rocket-launch-outline' },
  { value: 'other', label: 'Other', icon: 'dots-horizontal' },
];

export const kindLabel = (kind: string) => MAINTENANCE_KINDS.find((k) => k.value === kind)?.label ?? 'Service';
export const kindIcon = (kind: string) => MAINTENANCE_KINDS.find((k) => k.value === kind)?.icon ?? 'wrench-outline';

export type Fill = { litres: number; odometerKm: number | null; fullTank: boolean };

/**
 * Fuel use in litres per 100 km, the tank-to-tank way: between two full tanks, the fuel that went
 * in is the fuel that was burned. Fills without an odometer reading, or partial fills that
 * aren't followed by a full one, can't be counted. Null until there are two full fills.
 */
export function fuelEconomy(fills: Fill[]): number | null {
  const known = fills.filter((f) => f.odometerKm != null).sort((a, b) => a.odometerKm! - b.odometerKm!);
  let from: number | null = null;
  let pending = 0;
  let litres = 0;
  let km = 0;
  for (const f of known) {
    if (from === null) {
      // Counting starts at the first full tank; what went in before it is unknown.
      if (f.fullTank) from = f.odometerKm!;
      continue;
    }
    pending += f.litres;
    if (f.fullTank) {
      litres += pending;
      km += f.odometerKm! - from;
      from = f.odometerKm!;
      pending = 0;
    }
  }
  return km > 0 && litres > 0 ? (litres / km) * 100 : null;
}

/** "31 mpg" or "7.6 L/100 km". */
export function economyLabel(units: Units, litresPer100Km: number): string {
  return units === 'imperial' ? `${Math.round(235.215 / litresPer100Km)} mpg` : `${litresPer100Km.toFixed(1)} L/100 km`;
}

export const distanceUnit = (units: Units) => (units === 'imperial' ? 'mi' : 'km');
export const volumeUnit = (units: Units) => (units === 'imperial' ? 'gal' : 'L');

export const toKm = (units: Units, v: number) => (units === 'imperial' ? v * KM_PER_MILE : v);
export const fromKm = (units: Units, km: number) => (units === 'imperial' ? km / KM_PER_MILE : km);
export const toLitres = (units: Units, v: number) => (units === 'imperial' ? v * LITRES_PER_GALLON : v);
export const fromLitres = (units: Units, l: number) => (units === 'imperial' ? l / LITRES_PER_GALLON : l);

/** A number someone typed ("1,234.5", " 40 "), or null when it isn't one or is negative. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Money typed as "45.99" to cents; null when empty or not a number. */
export function parseCents(text: string): number | null {
  const n = parseNumber(text.replace(/[^0-9.,\s]/g, ''));
  return n === null ? null : Math.round(n * 100);
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** What was spent on a car since a date (ISO day), service and fuel together. */
export function spentSince(sinceDay: string, service: { done_on: string; cost_cents: number | null }[], fuel: { filled_on: string; cost_cents: number | null }[]): number {
  const sum = (rows: { day: string; cents: number | null }[]) => rows.filter((r) => r.day >= sinceDay).reduce((t, r) => t + (r.cents ?? 0), 0);
  return sum(service.map((s) => ({ day: s.done_on, cents: s.cost_cents }))) + sum(fuel.map((f) => ({ day: f.filled_on, cents: f.cost_cents })));
}
