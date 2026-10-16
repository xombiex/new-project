import { useRef } from 'react';

/** GPS heading is missing when stopped; keep pointing the last known way instead of snapping north. */
export function useSteadyHeading(heading: number | null | undefined) {
  const last = useRef(0);
  if (heading != null && Number.isFinite(heading)) last.current = heading;
  return last.current;
}
