import type { Camera } from '@/lib/cameras';

export function cameraFeatures(cameras: Camera[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cameras.map((c) => ({
      type: 'Feature',
      id: c.id,
      geometry: { type: 'Point', coordinates: c.coord },
      // Unconfirmed community reports get a faded icon with a "?".
      properties: { kind: c.kind, id: c.id, icon: `cam-${c.status === 'pending' ? 'pending-' : ''}${c.kind}` },
    })),
  };
}
