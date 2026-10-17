import type { Camera } from '@/lib/cameras';

export function cameraFeatures(cameras: Camera[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cameras.map((c) => ({
      type: 'Feature',
      id: c.id,
      geometry: { type: 'Point', coordinates: c.coord },
      properties: { kind: c.kind },
    })),
  };
}
