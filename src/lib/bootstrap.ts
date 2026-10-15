/**
 * Module-scope wiring that must exist even when the OS launches the app headlessly
 * to deliver background locations (no screens are mounted in that case).
 */
import { addReason, onLocation } from '@/lib/location';
import { useTrips } from '@/store/trips';

onLocation((samples) => useTrips.getState().ingest(samples));

// A trip in progress survives restarts; resume GPS for it once persisted state loads.
const resumeTrip = () => {
  if (useTrips.getState().active) void addReason('trip');
};
if (useTrips.persist.hasHydrated()) resumeTrip();
else useTrips.persist.onFinishHydration(resumeTrip);
