// Type-only: the style-spec types ship with maplibre-gl and match the native layer props.
import type { SymbolLayerSpecification } from 'maplibre-gl';

import type { Vehicle } from '@/lib/vehicles';

/**
 * 3D-rendered, top-down vehicle sprites (front = top of the image) for map symbol layers.
 * Regenerate with scripts/vehicle-sprites (renders them with three.js).
 */
export const VEHICLE_IMAGES = {
  'vehicle-car': require('../../../assets/vehicles/car.png'),
  'vehicle-sport': require('../../../assets/vehicles/sport.png'),
  'vehicle-suv': require('../../../assets/vehicles/suv.png'),
  'vehicle-pickup': require('../../../assets/vehicles/pickup.png'),
  'vehicle-moto': require('../../../assets/vehicles/moto.png'),
  'vehicle-jeep': require('../../../assets/vehicles/jeep.png'),
} as const;

export type VehicleSprite = keyof typeof VEHICLE_IMAGES;

export function vehicleSprite(v: Vehicle | string | null | undefined): VehicleSprite {
  const key = `vehicle-${v ?? 'car'}`;
  return key in VEHICLE_IMAGES ? (key as VehicleSprite) : 'vehicle-car';
}

/** Symbol layout shared by native and web: rotate with the map so the nose points along the heading. */
export const VEHICLE_LAYOUT: NonNullable<SymbolLayerSpecification['layout']> = {
  // Chunky up close, smaller when zoomed out to a city view.
  'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 15, 1.5, 18, 2.1],
  'icon-rotation-alignment': 'map',
  'icon-pitch-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
};
