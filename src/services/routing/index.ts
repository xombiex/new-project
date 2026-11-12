import { osrmProvider } from './osrm';
import { createRouter } from './router';
import { valhallaProvider } from './valhalla';

export * from './types';
export { createRouter } from './router';

/**
 * Free, keyless OpenStreetMap routers. Both public endpoints are fair-use only: point the env
 * vars at a self-hosted instance (or a paid host) once usage grows.
 */
const OSRM_URL = process.env.EXPO_PUBLIC_OSRM_URL ?? 'https://router.project-osrm.org';
const VALHALLA_URL = process.env.EXPO_PUBLIC_VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de';

/** OSRM first for the fastest way (it's quicker to answer); Valhalla covers the rest and stands in when OSRM is down. */
export const router = createRouter([osrmProvider(OSRM_URL), valhallaProvider(VALHALLA_URL)]);
