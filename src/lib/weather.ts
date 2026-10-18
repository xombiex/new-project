import { haversine, type LngLat } from '@/lib/geo';

/**
 * Weather along a route from Open-Meteo (free, no key; fair use). We sample a handful of points
 * along the road, look up the forecast for the hour you'll be at each one, and report the first
 * spot with rain, snow, storms or fog.
 */
const WEATHER_URL = process.env.EXPO_PUBLIC_WEATHER_URL ?? 'https://api.open-meteo.com/v1/forecast';

export type WeatherKind = 'rain' | 'heavy-rain' | 'snow' | 'storm' | 'fog';

export type WeatherAlert = {
  kind: WeatherKind;
  /** minutes from now until you reach it (0 = where you are) */
  minutes: number;
  /** road or area name near the spot, when known */
  place: string | null;
};

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  rain: 'Rain',
  'heavy-rain': 'Heavy rain',
  snow: 'Snow',
  storm: 'Thunderstorms',
  fog: 'Fog',
};

export const WEATHER_ICON: Record<WeatherKind, string> = {
  rain: 'weather-rainy',
  'heavy-rain': 'weather-pouring',
  snow: 'weather-snowy',
  storm: 'weather-lightning-rainy',
  fog: 'weather-fog',
};

/** WMO weather code (+ precipitation in mm/h) → what a driver cares about. */
export function weatherKind(code: number, precipMm: number): WeatherKind | null {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 65 || code === 82 || precipMm >= 4) return 'heavy-rain';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || precipMm >= 0.3) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  return null;
}

export type RoutePoint = { coord: LngLat; minutes: number; place: string | null };

/**
 * Up to `max` points from `fromM` meters along the route to its end, with when you'll get there.
 * `places` are named spots along the route (e.g. maneuvers) used to say "near …".
 */
export function samplePoints(
  geometry: LngLat[],
  cumulative: number[],
  durationS: number,
  fromM: number,
  places: { along: number; name: string }[] = [],
  max = 8
): RoutePoint[] {
  const total = cumulative.at(-1) ?? 0;
  if (geometry.length < 2 || total <= 0) return [];
  const left = Math.max(0, total - fromM);
  const step = Math.max(3000, left / (max - 1));
  const out: RoutePoint[] = [];
  let i = 0;
  for (let along = fromM; along <= total + 1 && out.length < max; along += step) {
    while (i < cumulative.length - 2 && cumulative[i + 1] < along) i++;
    const t = (along - cumulative[i]) / Math.max(1e-9, cumulative[i + 1] - cumulative[i]);
    const a = geometry[i];
    const b = geometry[i + 1];
    const coord: LngLat = [a[0] + (b[0] - a[0]) * Math.min(1, Math.max(0, t)), a[1] + (b[1] - a[1]) * Math.min(1, Math.max(0, t))];
    const near = [...places].reverse().find((p) => p.name && p.along <= along + 500);
    out.push({ coord, minutes: Math.round(((along - fromM) / total) * (durationS / 60)), place: near?.name ?? null });
  }
  return out;
}

type Forecast = { hourly: { time: string[]; weather_code: number[]; precipitation: number[] } };

/** First bad-weather spot, given each point's forecast. Pure, for testing. */
export function firstAlert(points: RoutePoint[], forecasts: Forecast[], now = Date.now()): WeatherAlert | null {
  for (let k = 0; k < points.length; k++) {
    const f = forecasts[k]?.hourly;
    if (!f) continue;
    const at = now + points[k].minutes * 60_000;
    const hour = new Date(at).toISOString().slice(0, 13); // "2026-10-18T02"
    const idx = f.time.findIndex((t) => t.startsWith(hour));
    if (idx < 0) continue;
    const kind = weatherKind(f.weather_code[idx] ?? 0, f.precipitation[idx] ?? 0);
    if (kind) return { kind, minutes: points[k].minutes, place: points[k].place };
  }
  return null;
}

/** Forecast lookup for route points (one request for all of them). */
export async function weatherAlong(points: RoutePoint[], signal?: AbortSignal): Promise<WeatherAlert | null> {
  if (points.length === 0) return null;
  const hours = Math.min(48, Math.ceil(Math.max(...points.map((p) => p.minutes)) / 60) + 2);
  const params = new URLSearchParams({
    latitude: points.map((p) => p.coord[1].toFixed(3)).join(','),
    longitude: points.map((p) => p.coord[0].toFixed(3)).join(','),
    hourly: 'weather_code,precipitation',
    forecast_hours: String(hours),
    timezone: 'GMT',
  });
  const res = await fetch(`${WEATHER_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const json = (await res.json()) as Forecast | Forecast[];
  return firstAlert(points, Array.isArray(json) ? json : [json]);
}

/** Cumulative meters for a plain geometry (planned routes don't carry it). */
export function cumulativeOf(geometry: LngLat[]): number[] {
  const c = [0];
  for (let i = 1; i < geometry.length; i++) c.push(c[i - 1] + haversine(geometry[i - 1], geometry[i]));
  return c;
}

/** "Rain near Kennedy Blvd in 15 min" / "Rain where you are". */
export function describeAlert(a: WeatherAlert): string {
  const what = WEATHER_LABEL[a.kind];
  if (a.minutes <= 2) return `${what} where you are`;
  const when = a.minutes < 60 ? `${a.minutes} min` : `${Math.floor(a.minutes / 60)} hr ${a.minutes % 60} min`;
  return `${what}${a.place ? ` near ${a.place}` : ''} in ${when}`;
}
