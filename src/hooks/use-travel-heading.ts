import { useRef } from 'react';

import type { LocationSample } from '@/lib/trip-recorder';
import { nextTravelHeading, NO_HEADING } from '@/lib/travel-heading';

/** Direction of travel from the latest location fix; see lib/travel-heading. */
export function useTravelHeading(sample: LocationSample | null | undefined): number | null {
  const state = useRef(NO_HEADING);
  const seen = useRef<LocationSample | null>(null);
  if (sample && sample !== seen.current) {
    seen.current = sample;
    state.current = nextTravelHeading(state.current, sample);
  }
  return state.current.heading;
}
