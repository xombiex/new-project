// Severe weather alerts from the US National Weather Service (api.weather.gov): free, no key.
// Outside the US the API has nothing for you, and we show nothing.

export type NwsSeverity = 'Extreme' | 'Severe' | 'Moderate';

export type NwsAlert = {
  id: string;
  /** "Winter Storm Warning" */
  event: string;
  headline: string;
  severity: NwsSeverity;
  /** What to do, from the forecasters (may be empty). */
  instruction: string;
  description: string;
  areaDesc: string;
  /** When it ends, if known. */
  ends: string | null;
  /** Where it applies: where you are, or where you're going. */
  where: 'here' | 'destination';
};

const RANK: Record<NwsSeverity, number> = { Extreme: 3, Severe: 2, Moderate: 1 };
export const NWS_COLOR: Record<NwsSeverity, string> = { Extreme: '#9B1C1C', Severe: '#D93025', Moderate: '#E8710A' };

/** Icon for the alert pill, by the kind of event. */
export function nwsIcon(event: string): string {
  const e = event.toLowerCase();
  if (/tornado/.test(e)) return 'weather-tornado';
  if (/hurricane|tropical/.test(e)) return 'weather-hurricane';
  if (/flood/.test(e)) return 'home-flood';
  if (/winter|snow|blizzard|ice|freez|sleet/.test(e)) return 'weather-snowy-heavy';
  if (/thunder|lightning/.test(e)) return 'weather-lightning-rainy';
  if (/wind/.test(e)) return 'weather-windy';
  if (/fog|smoke|dust/.test(e)) return 'weather-fog';
  if (/fire|red flag/.test(e)) return 'fire';
  if (/heat/.test(e)) return 'thermometer-high';
  return 'alert';
}

type Feature = {
  properties: {
    id: string;
    event: string;
    headline: string | null;
    severity: string;
    status: string;
    instruction: string | null;
    description: string | null;
    areaDesc: string;
    ends: string | null;
    expires: string | null;
  };
};

/** The most serious current alert in an api.weather.gov response, or null. Minor ones are left out. */
export function pickAlert(features: Feature[], where: NwsAlert['where']): NwsAlert | null {
  let best: NwsAlert | null = null;
  for (const { properties: p } of features) {
    if (p.status !== 'Actual' || !(p.severity in RANK)) continue;
    const severity = p.severity as NwsSeverity;
    if (best && RANK[best.severity] >= RANK[severity]) continue;
    best = {
      id: p.id,
      event: p.event,
      headline: p.headline ?? p.event,
      severity,
      instruction: (p.instruction ?? '').trim(),
      description: (p.description ?? '').trim(),
      areaDesc: p.areaDesc,
      ends: p.ends ?? p.expires,
      where,
    };
  }
  return best;
}

/** Alerts covering a point ([lng, lat]). Null when there are none or the API can't say. */
export async function alertAt(coord: [number, number], where: NwsAlert['where'], signal?: AbortSignal): Promise<NwsAlert | null> {
  const [lng, lat] = coord;
  const res = await fetch(`https://api.weather.gov/alerts/active?status=actual&point=${lat.toFixed(4)},${lng.toFixed(4)}`, {
    headers: { Accept: 'application/geo+json' },
    signal,
  });
  if (!res.ok) return null; // 400 outside the US
  const body = (await res.json()) as { features?: Feature[] };
  return pickAlert(body.features ?? [], where);
}

/** The worse of two alerts; on a tie, the one where you are now. */
export function worse(a: NwsAlert | null, b: NwsAlert | null): NwsAlert | null {
  if (!a || !b) return a ?? b;
  return RANK[b.severity] > RANK[a.severity] ? b : a;
}
