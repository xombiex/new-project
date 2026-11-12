import type { MaintenanceKind } from '@/lib/garage-log';
import { supabase } from '@/lib/supabase';

import type { FuelRow, MaintenanceRow } from './database.types';
import { classify, ok, type Result } from './types';

export type NewService = { carId: string; kind: MaintenanceKind; doneOn: string; odometerKm: number | null; costCents: number | null; notes: string | null };
export type NewFill = { carId: string; filledOn: string; litres: number; odometerKm: number | null; costCents: number | null; fullTank: boolean };

/** A car's service and fuel records. Private to the car's owner. */
export interface GarageLogService {
  load(carId: string): Promise<Result<{ service: MaintenanceRow[]; fuel: FuelRow[] }>>;
  addService(entry: NewService): Promise<Result<MaintenanceRow>>;
  addFill(entry: NewFill): Promise<Result<FuelRow>>;
  remove(kind: 'service' | 'fuel', id: string): Promise<Result<void>>;
}

/** The newest 200 of each: years of records for one car, and never an unbounded request. */
const LIMIT = 200;

async function attempt<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    return { ok: false, error: classify(e) };
  }
}

export const garageLog: GarageLogService = {
  load: (carId) =>
    attempt(async () => {
      const [service, fuel] = await Promise.all([
        supabase.from('car_maintenance').select('*').eq('car_id', carId).order('done_on', { ascending: false }).order('id', { ascending: false }).limit(LIMIT),
        supabase.from('car_fuel').select('*').eq('car_id', carId).order('filled_on', { ascending: false }).order('id', { ascending: false }).limit(LIMIT),
      ]);
      const error = service.error ?? fuel.error;
      if (error) return { ok: false, error: classify(error) };
      return ok({ service: (service.data ?? []) as MaintenanceRow[], fuel: (fuel.data ?? []) as FuelRow[] });
    }),

  addService: (e) =>
    attempt(async () => {
      const { data, error } = await supabase
        .from('car_maintenance')
        .insert({ car_id: e.carId, kind: e.kind, done_on: e.doneOn, odometer_km: e.odometerKm, cost_cents: e.costCents, notes: e.notes })
        .select('*')
        .single();
      return error ? { ok: false, error: classify(error) } : ok(data as MaintenanceRow);
    }),

  addFill: (e) =>
    attempt(async () => {
      const { data, error } = await supabase
        .from('car_fuel')
        .insert({ car_id: e.carId, filled_on: e.filledOn, litres: e.litres, odometer_km: e.odometerKm, cost_cents: e.costCents, full_tank: e.fullTank })
        .select('*')
        .single();
      return error ? { ok: false, error: classify(error) } : ok(data as FuelRow);
    }),

  remove: (kind, id) =>
    attempt(async () => {
      const { error } = await supabase.from(kind === 'service' ? 'car_maintenance' : 'car_fuel').delete().eq('id', id);
      return error ? { ok: false, error: classify(error) } : ok(undefined);
    }),
};
