import { lookupPerformance } from '@/lib/car-performance';
import type { Vehicle } from '@/lib/vehicles';

/**
 * Car facts for the garage, from free US government data:
 *   - fueleconomy.gov (EPA): every car sold in the US since 1984 — year, make, model, trim,
 *     drivetrain, transmission, engine, fuel, MPG / EV range and size class.
 *   - NHTSA vPIC: decodes a VIN, often including the exact horsepower.
 *   - car-performance.ts: horsepower / torque / 0–60 for popular models where neither has it.
 * The owner can override any number (modded cars).
 */
const EPA = 'https://www.fueleconomy.gov/ws/rest';
const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';

export type CarSpecs = {
  hp?: number;
  torque?: number;
  zeroToSixty?: number;
  topSpeedMph?: number;
  drivetrain?: string;
  transmission?: string;
  engine?: string;
  fuel?: string;
  mpgCity?: number;
  mpgHwy?: number;
  mpgComb?: number;
  evRangeMi?: number;
  vehicleClass?: string;
  epaId?: string;
  /** which numbers the owner typed in themselves (shown as "your build") */
  custom?: ('hp' | 'torque' | 'zeroToSixty' | 'topSpeedMph')[];
};

export type MenuItem = { text: string; value: string };

async function epaMenu(path: string, signal?: AbortSignal): Promise<MenuItem[]> {
  const res = await fetch(`${EPA}/vehicle/menu/${path}`, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Vehicle list unavailable (${res.status})`);
  const text = await res.text();
  if (!text) return [];
  const json = JSON.parse(text) as { menuItem?: MenuItem | MenuItem[] } | null;
  const items = json?.menuItem;
  // One result comes back as an object instead of a list.
  return items ? (Array.isArray(items) ? items : [items]) : [];
}

const q = encodeURIComponent;
export const epaYears = (signal?: AbortSignal) => epaMenu('year', signal);
export const epaMakes = (year: number, signal?: AbortSignal) => epaMenu(`make?year=${year}`, signal);
export const epaModels = (year: number, make: string, signal?: AbortSignal) => epaMenu(`model?year=${year}&make=${q(make)}`, signal);
export const epaTrims = (year: number, make: string, model: string, signal?: AbortSignal) => epaMenu(`options?year=${year}&make=${q(make)}&model=${q(model)}`, signal);

type EpaVehicle = Record<string, string | undefined>;

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** "Rear-Wheel Drive" → "RWD", "4-Wheel or All-Wheel Drive" → "AWD", "Part-time 4-Wheel Drive" → "4WD". */
export function drivetrainLabel(drive: string | undefined): string | undefined {
  if (!drive) return undefined;
  const d = drive.toLowerCase();
  if (d.includes('rear')) return 'RWD';
  if (d.includes('front')) return 'FWD';
  if (d.includes('all') || d.includes('awd')) return 'AWD';
  if (d.includes('4-wheel') || d.includes('4wd') || d.includes('4x4')) return '4WD';
  return drive;
}

/** "Automatic (AM-S8)" → "8-speed dual-clutch", "Manual 6-spd" → "6-speed manual", "(AV-S7)" → "CVT". */
export function transmissionLabel(trany: string | undefined): string | undefined {
  if (!trany) return undefined;
  const speeds = /(\d+)/.exec(trany)?.[1];
  if (/\(AV|variable|CVT/i.test(trany)) return 'CVT';
  if (/^manual/i.test(trany)) return speeds ? `${speeds}-speed manual` : 'Manual';
  if (/\(AM/i.test(trany)) return speeds ? `${speeds}-speed dual-clutch` : 'Dual-clutch';
  if (/\(A1\)/i.test(trany)) return 'Single-speed (EV)';
  if (/^auto/i.test(trany)) return speeds ? `${speeds}-speed automatic` : 'Automatic';
  return trany;
}

/** "3.0", 6 cyl, turbo → "3.0L twin-turbo… " (EPA can't tell twin from single, so just "turbo"). */
export function engineLabel(v: EpaVehicle): string | undefined {
  if (v.atvType === 'EV' || (!num(v.displ) && v.evMotor)) return v.evMotor ? `Electric (${v.evMotor})` : 'Electric';
  const parts = [
    num(v.displ) ? `${Number(v.displ).toFixed(1)}L` : null,
    v.tCharger ? 'turbo' : v.sCharger === 'S' ? 'supercharged' : null,
    num(v.cylinders) ? `${v.cylinders}-cyl` : null,
    v.atvType === 'Hybrid' || v.atvType === 'Plug-in Hybrid' ? v.atvType.toLowerCase() : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/** Turn an EPA vehicle record into garage specs (plus table performance where we have it). */
export function specsFromEpa(v: EpaVehicle): CarSpecs {
  const ev = v.atvType === 'EV';
  const perf = lookupPerformance(v.make ?? '', v.model ?? '', num(v.year) ?? null, { cyl: num(v.cylinders), displ: num(v.displ) });
  return clean({
    ...perf,
    drivetrain: drivetrainLabel(v.drive),
    transmission: transmissionLabel(v.trany),
    engine: engineLabel(v),
    fuel: ev ? 'Electric' : v.fuelType1 ?? v.fuelType,
    mpgCity: ev ? undefined : num(v.city08),
    mpgHwy: ev ? undefined : num(v.highway08),
    mpgComb: ev ? undefined : num(v.comb08),
    evRangeMi: num(v.range),
    vehicleClass: v.VClass,
    epaId: v.id,
  });
}

export async function epaVehicle(id: string, signal?: AbortSignal): Promise<EpaVehicle> {
  const res = await fetch(`${EPA}/vehicle/${q(id)}`, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Vehicle details unavailable (${res.status})`);
  return (await res.json()) as EpaVehicle;
}

export type VinResult = { year: number | null; make: string; model: string; trim: string | null; specs: CarSpecs; body: Vehicle | null };

/** Decode a 17-character VIN (NHTSA). Exact horsepower when the manufacturer reported it. */
export async function decodeVin(vin: string, signal?: AbortSignal): Promise<VinResult> {
  const clean17 = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(clean17)) throw new Error('A VIN is 17 letters and numbers (no I, O or Q).');
  const res = await fetch(`${VPIC}/DecodeVinValues/${clean17}?format=json`, { signal });
  if (!res.ok) throw new Error(`VIN lookup unavailable (${res.status})`);
  const r = ((await res.json()) as { Results: Record<string, string>[] }).Results[0] ?? {};
  if (!r.Make || !r.Model) throw new Error('That VIN wasn’t recognized. Check it, or pick your car from the list instead.');
  const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const year = num(r.ModelYear) ?? null;
  const make = r.Make.length <= 4 ? r.Make : title(r.Make); // keep BMW, GMC, RAM as-is
  const cyl = num(r.EngineCylinders);
  const displ = num(r.DisplacementL);
  const perf = lookupPerformance(make, `${r.Model} ${r.Trim ?? ''}`, year, { cyl, displ });
  return {
    year,
    make,
    model: r.Model,
    trim: r.Trim || r.Series || null,
    body: bodyFromText(`${r.BodyClass ?? ''} ${r.VehicleType ?? ''}`),
    specs: clean({
      ...perf,
      hp: num(r.EngineHP) ? Math.round(Number(r.EngineHP)) : perf?.hp,
      drivetrain: drivetrainLabel(r.DriveType),
      transmission: r.TransmissionStyle ? `${r.TransmissionSpeeds ? `${r.TransmissionSpeeds}-speed ` : ''}${r.TransmissionStyle.toLowerCase()}` : undefined,
      engine: displ || cyl ? [displ ? `${displ.toFixed(1)}L` : null, r.Turbo === 'Yes' ? 'turbo' : null, cyl ? `${cyl}-cyl` : null].filter(Boolean).join(' ') : undefined,
      fuel: r.FuelTypePrimary || undefined,
    }),
  };
}

/** Suggest a 3D body from an EPA size class or NHTSA body class. */
export function bodyFromText(text: string | undefined): Vehicle | null {
  const t = (text ?? '').toLowerCase();
  if (/pickup|truck/.test(t)) return 'pickup';
  if (/van/.test(t)) return 'van';
  if (/sport utility|suv|multipurpose/.test(t)) return 'suv';
  if (/motorcycle/.test(t)) return 'moto';
  if (/two seater|minicompact|convertible|coupe/.test(t)) return 'sport';
  if (/hatchback|small station wagon/.test(t)) return 'hatch';
  if (/car|sedan|wagon/.test(t)) return 'car';
  return null;
}

/** Drop empty fields so the stored JSON stays small. */
function clean(s: CarSpecs): CarSpecs {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null && v !== '')) as CarSpecs;
}

/** One-line summary for a car card: "443 hp · 0–60 3.3 s · RWD · 8-speed dual-clutch". */
export function specLine(s: CarSpecs | null | undefined): string | null {
  if (!s) return null;
  const parts = [
    s.hp ? `${s.hp} hp` : null,
    s.zeroToSixty ? `0–60 ${s.zeroToSixty.toFixed(1)} s` : null,
    s.drivetrain ?? null,
    s.transmission ? s.transmission.replace('-speed', '-spd').replace('dual-clutch', 'DCT').replace('automatic', 'auto') : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
