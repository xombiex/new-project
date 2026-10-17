// Type-only: the style-spec types ship with maplibre-gl and match the native layer props.
import type { SymbolLayerSpecification } from 'maplibre-gl';

import type { ImageSourcePropType } from 'react-native';
import { Platform } from 'react-native';

import { PAINTS, VEHICLES, type Paint, type Vehicle } from '@/lib/vehicles';

/**
 * 3D-rendered, top-down vehicle sprites (front = top of the image), one per model and paint.
 * Regenerate with scripts/vehicle-sprites (renders them with three.js). Requires must be static
 * for the bundler, hence the full list.
 */
export const VEHICLE_IMAGES = {
  'vehicle-car-blue': require('../../../assets/vehicles/car-blue.png'),
  'vehicle-car-red': require('../../../assets/vehicles/car-red.png'),
  'vehicle-car-orange': require('../../../assets/vehicles/car-orange.png'),
  'vehicle-car-yellow': require('../../../assets/vehicles/car-yellow.png'),
  'vehicle-car-green': require('../../../assets/vehicles/car-green.png'),
  'vehicle-car-purple': require('../../../assets/vehicles/car-purple.png'),
  'vehicle-car-white': require('../../../assets/vehicles/car-white.png'),
  'vehicle-car-silver': require('../../../assets/vehicles/car-silver.png'),
  'vehicle-car-black': require('../../../assets/vehicles/car-black.png'),
  'vehicle-hatch-blue': require('../../../assets/vehicles/hatch-blue.png'),
  'vehicle-hatch-red': require('../../../assets/vehicles/hatch-red.png'),
  'vehicle-hatch-orange': require('../../../assets/vehicles/hatch-orange.png'),
  'vehicle-hatch-yellow': require('../../../assets/vehicles/hatch-yellow.png'),
  'vehicle-hatch-green': require('../../../assets/vehicles/hatch-green.png'),
  'vehicle-hatch-purple': require('../../../assets/vehicles/hatch-purple.png'),
  'vehicle-hatch-white': require('../../../assets/vehicles/hatch-white.png'),
  'vehicle-hatch-silver': require('../../../assets/vehicles/hatch-silver.png'),
  'vehicle-hatch-black': require('../../../assets/vehicles/hatch-black.png'),
  'vehicle-sport-blue': require('../../../assets/vehicles/sport-blue.png'),
  'vehicle-sport-red': require('../../../assets/vehicles/sport-red.png'),
  'vehicle-sport-orange': require('../../../assets/vehicles/sport-orange.png'),
  'vehicle-sport-yellow': require('../../../assets/vehicles/sport-yellow.png'),
  'vehicle-sport-green': require('../../../assets/vehicles/sport-green.png'),
  'vehicle-sport-purple': require('../../../assets/vehicles/sport-purple.png'),
  'vehicle-sport-white': require('../../../assets/vehicles/sport-white.png'),
  'vehicle-sport-silver': require('../../../assets/vehicles/sport-silver.png'),
  'vehicle-sport-black': require('../../../assets/vehicles/sport-black.png'),
  'vehicle-classic-blue': require('../../../assets/vehicles/classic-blue.png'),
  'vehicle-classic-red': require('../../../assets/vehicles/classic-red.png'),
  'vehicle-classic-orange': require('../../../assets/vehicles/classic-orange.png'),
  'vehicle-classic-yellow': require('../../../assets/vehicles/classic-yellow.png'),
  'vehicle-classic-green': require('../../../assets/vehicles/classic-green.png'),
  'vehicle-classic-purple': require('../../../assets/vehicles/classic-purple.png'),
  'vehicle-classic-white': require('../../../assets/vehicles/classic-white.png'),
  'vehicle-classic-silver': require('../../../assets/vehicles/classic-silver.png'),
  'vehicle-classic-black': require('../../../assets/vehicles/classic-black.png'),
  'vehicle-suv-blue': require('../../../assets/vehicles/suv-blue.png'),
  'vehicle-suv-red': require('../../../assets/vehicles/suv-red.png'),
  'vehicle-suv-orange': require('../../../assets/vehicles/suv-orange.png'),
  'vehicle-suv-yellow': require('../../../assets/vehicles/suv-yellow.png'),
  'vehicle-suv-green': require('../../../assets/vehicles/suv-green.png'),
  'vehicle-suv-purple': require('../../../assets/vehicles/suv-purple.png'),
  'vehicle-suv-white': require('../../../assets/vehicles/suv-white.png'),
  'vehicle-suv-silver': require('../../../assets/vehicles/suv-silver.png'),
  'vehicle-suv-black': require('../../../assets/vehicles/suv-black.png'),
  'vehicle-van-blue': require('../../../assets/vehicles/van-blue.png'),
  'vehicle-van-red': require('../../../assets/vehicles/van-red.png'),
  'vehicle-van-orange': require('../../../assets/vehicles/van-orange.png'),
  'vehicle-van-yellow': require('../../../assets/vehicles/van-yellow.png'),
  'vehicle-van-green': require('../../../assets/vehicles/van-green.png'),
  'vehicle-van-purple': require('../../../assets/vehicles/van-purple.png'),
  'vehicle-van-white': require('../../../assets/vehicles/van-white.png'),
  'vehicle-van-silver': require('../../../assets/vehicles/van-silver.png'),
  'vehicle-van-black': require('../../../assets/vehicles/van-black.png'),
  'vehicle-pickup-blue': require('../../../assets/vehicles/pickup-blue.png'),
  'vehicle-pickup-red': require('../../../assets/vehicles/pickup-red.png'),
  'vehicle-pickup-orange': require('../../../assets/vehicles/pickup-orange.png'),
  'vehicle-pickup-yellow': require('../../../assets/vehicles/pickup-yellow.png'),
  'vehicle-pickup-green': require('../../../assets/vehicles/pickup-green.png'),
  'vehicle-pickup-purple': require('../../../assets/vehicles/pickup-purple.png'),
  'vehicle-pickup-white': require('../../../assets/vehicles/pickup-white.png'),
  'vehicle-pickup-silver': require('../../../assets/vehicles/pickup-silver.png'),
  'vehicle-pickup-black': require('../../../assets/vehicles/pickup-black.png'),
  'vehicle-jeep-blue': require('../../../assets/vehicles/jeep-blue.png'),
  'vehicle-jeep-red': require('../../../assets/vehicles/jeep-red.png'),
  'vehicle-jeep-orange': require('../../../assets/vehicles/jeep-orange.png'),
  'vehicle-jeep-yellow': require('../../../assets/vehicles/jeep-yellow.png'),
  'vehicle-jeep-green': require('../../../assets/vehicles/jeep-green.png'),
  'vehicle-jeep-purple': require('../../../assets/vehicles/jeep-purple.png'),
  'vehicle-jeep-white': require('../../../assets/vehicles/jeep-white.png'),
  'vehicle-jeep-silver': require('../../../assets/vehicles/jeep-silver.png'),
  'vehicle-jeep-black': require('../../../assets/vehicles/jeep-black.png'),
  'vehicle-moto-blue': require('../../../assets/vehicles/moto-blue.png'),
  'vehicle-moto-red': require('../../../assets/vehicles/moto-red.png'),
  'vehicle-moto-orange': require('../../../assets/vehicles/moto-orange.png'),
  'vehicle-moto-yellow': require('../../../assets/vehicles/moto-yellow.png'),
  'vehicle-moto-green': require('../../../assets/vehicles/moto-green.png'),
  'vehicle-moto-purple': require('../../../assets/vehicles/moto-purple.png'),
  'vehicle-moto-white': require('../../../assets/vehicles/moto-white.png'),
  'vehicle-moto-silver': require('../../../assets/vehicles/moto-silver.png'),
  'vehicle-moto-black': require('../../../assets/vehicles/moto-black.png'),
} as const;

export type VehicleSprite = keyof typeof VEHICLE_IMAGES;

export function vehicleSprite(model: Vehicle | string | null | undefined, paint?: Paint | string | null): VehicleSprite {
  const m = VEHICLES.some((v) => v.value === model) ? model : 'car';
  const p = PAINTS.some((x) => x.value === paint) ? paint : 'blue';
  return `vehicle-${m}-${p}` as VehicleSprite;
}

/**
 * Image source for UI previews. Native picks the @2x/@3x file itself; the web bundle only ships
 * the 1x file, so use the sharp @3x copy in public/vehicles instead.
 */
export function vehicleImage(sprite: VehicleSprite): ImageSourcePropType {
  return Platform.OS === 'web' ? { uri: `/vehicles/${sprite.replace('vehicle-', '')}.png` } : VEHICLE_IMAGES[sprite];
}

/** Map icons for cameras (speed = orange, license-plate reader = purple). */
export const CAMERA_IMAGES = {
  'cam-speed': require('../../../assets/cameras/speed.png'),
  'cam-alpr': require('../../../assets/cameras/alpr.png'),
} as const;

/** Camera dots: small when zoomed out, readable up close; never hidden by labels. */
export const CAMERA_LAYOUT: NonNullable<SymbolLayerSpecification['layout']> = {
  'icon-image': ['match', ['get', 'kind'], 'alpr', 'cam-alpr', 'cam-speed'],
  'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.7, 16, 1.1],
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
};

/** Garage showroom renders (three-quarter side view, nose right), one per body and paint. */
const SIDE_IMAGES: Record<string, ImageSourcePropType> = {
  'car-blue': require('../../../assets/vehicles/side-car-blue.webp'),
  'car-red': require('../../../assets/vehicles/side-car-red.webp'),
  'car-orange': require('../../../assets/vehicles/side-car-orange.webp'),
  'car-yellow': require('../../../assets/vehicles/side-car-yellow.webp'),
  'car-green': require('../../../assets/vehicles/side-car-green.webp'),
  'car-purple': require('../../../assets/vehicles/side-car-purple.webp'),
  'car-white': require('../../../assets/vehicles/side-car-white.webp'),
  'car-silver': require('../../../assets/vehicles/side-car-silver.webp'),
  'car-black': require('../../../assets/vehicles/side-car-black.webp'),
  'hatch-blue': require('../../../assets/vehicles/side-hatch-blue.webp'),
  'hatch-red': require('../../../assets/vehicles/side-hatch-red.webp'),
  'hatch-orange': require('../../../assets/vehicles/side-hatch-orange.webp'),
  'hatch-yellow': require('../../../assets/vehicles/side-hatch-yellow.webp'),
  'hatch-green': require('../../../assets/vehicles/side-hatch-green.webp'),
  'hatch-purple': require('../../../assets/vehicles/side-hatch-purple.webp'),
  'hatch-white': require('../../../assets/vehicles/side-hatch-white.webp'),
  'hatch-silver': require('../../../assets/vehicles/side-hatch-silver.webp'),
  'hatch-black': require('../../../assets/vehicles/side-hatch-black.webp'),
  'sport-blue': require('../../../assets/vehicles/side-sport-blue.webp'),
  'sport-red': require('../../../assets/vehicles/side-sport-red.webp'),
  'sport-orange': require('../../../assets/vehicles/side-sport-orange.webp'),
  'sport-yellow': require('../../../assets/vehicles/side-sport-yellow.webp'),
  'sport-green': require('../../../assets/vehicles/side-sport-green.webp'),
  'sport-purple': require('../../../assets/vehicles/side-sport-purple.webp'),
  'sport-white': require('../../../assets/vehicles/side-sport-white.webp'),
  'sport-silver': require('../../../assets/vehicles/side-sport-silver.webp'),
  'sport-black': require('../../../assets/vehicles/side-sport-black.webp'),
  'classic-blue': require('../../../assets/vehicles/side-classic-blue.webp'),
  'classic-red': require('../../../assets/vehicles/side-classic-red.webp'),
  'classic-orange': require('../../../assets/vehicles/side-classic-orange.webp'),
  'classic-yellow': require('../../../assets/vehicles/side-classic-yellow.webp'),
  'classic-green': require('../../../assets/vehicles/side-classic-green.webp'),
  'classic-purple': require('../../../assets/vehicles/side-classic-purple.webp'),
  'classic-white': require('../../../assets/vehicles/side-classic-white.webp'),
  'classic-silver': require('../../../assets/vehicles/side-classic-silver.webp'),
  'classic-black': require('../../../assets/vehicles/side-classic-black.webp'),
  'suv-blue': require('../../../assets/vehicles/side-suv-blue.webp'),
  'suv-red': require('../../../assets/vehicles/side-suv-red.webp'),
  'suv-orange': require('../../../assets/vehicles/side-suv-orange.webp'),
  'suv-yellow': require('../../../assets/vehicles/side-suv-yellow.webp'),
  'suv-green': require('../../../assets/vehicles/side-suv-green.webp'),
  'suv-purple': require('../../../assets/vehicles/side-suv-purple.webp'),
  'suv-white': require('../../../assets/vehicles/side-suv-white.webp'),
  'suv-silver': require('../../../assets/vehicles/side-suv-silver.webp'),
  'suv-black': require('../../../assets/vehicles/side-suv-black.webp'),
  'van-blue': require('../../../assets/vehicles/side-van-blue.webp'),
  'van-red': require('../../../assets/vehicles/side-van-red.webp'),
  'van-orange': require('../../../assets/vehicles/side-van-orange.webp'),
  'van-yellow': require('../../../assets/vehicles/side-van-yellow.webp'),
  'van-green': require('../../../assets/vehicles/side-van-green.webp'),
  'van-purple': require('../../../assets/vehicles/side-van-purple.webp'),
  'van-white': require('../../../assets/vehicles/side-van-white.webp'),
  'van-silver': require('../../../assets/vehicles/side-van-silver.webp'),
  'van-black': require('../../../assets/vehicles/side-van-black.webp'),
  'pickup-blue': require('../../../assets/vehicles/side-pickup-blue.webp'),
  'pickup-red': require('../../../assets/vehicles/side-pickup-red.webp'),
  'pickup-orange': require('../../../assets/vehicles/side-pickup-orange.webp'),
  'pickup-yellow': require('../../../assets/vehicles/side-pickup-yellow.webp'),
  'pickup-green': require('../../../assets/vehicles/side-pickup-green.webp'),
  'pickup-purple': require('../../../assets/vehicles/side-pickup-purple.webp'),
  'pickup-white': require('../../../assets/vehicles/side-pickup-white.webp'),
  'pickup-silver': require('../../../assets/vehicles/side-pickup-silver.webp'),
  'pickup-black': require('../../../assets/vehicles/side-pickup-black.webp'),
  'jeep-blue': require('../../../assets/vehicles/side-jeep-blue.webp'),
  'jeep-red': require('../../../assets/vehicles/side-jeep-red.webp'),
  'jeep-orange': require('../../../assets/vehicles/side-jeep-orange.webp'),
  'jeep-yellow': require('../../../assets/vehicles/side-jeep-yellow.webp'),
  'jeep-green': require('../../../assets/vehicles/side-jeep-green.webp'),
  'jeep-purple': require('../../../assets/vehicles/side-jeep-purple.webp'),
  'jeep-white': require('../../../assets/vehicles/side-jeep-white.webp'),
  'jeep-silver': require('../../../assets/vehicles/side-jeep-silver.webp'),
  'jeep-black': require('../../../assets/vehicles/side-jeep-black.webp'),
  'moto-blue': require('../../../assets/vehicles/side-moto-blue.webp'),
  'moto-red': require('../../../assets/vehicles/side-moto-red.webp'),
  'moto-orange': require('../../../assets/vehicles/side-moto-orange.webp'),
  'moto-yellow': require('../../../assets/vehicles/side-moto-yellow.webp'),
  'moto-green': require('../../../assets/vehicles/side-moto-green.webp'),
  'moto-purple': require('../../../assets/vehicles/side-moto-purple.webp'),
  'moto-white': require('../../../assets/vehicles/side-moto-white.webp'),
  'moto-silver': require('../../../assets/vehicles/side-moto-silver.webp'),
  'moto-black': require('../../../assets/vehicles/side-moto-black.webp'),
};

/** Showroom image for a body + paint. The web loads the same WebP from public/vehicles. */
export function sideImage(model: Vehicle | string | null | undefined, paint?: Paint | string | null): ImageSourcePropType {
  const key = vehicleSprite(model, paint).replace('vehicle-', '');
  return Platform.OS === 'web' ? { uri: `/vehicles/side-${key}.webp` } : SIDE_IMAGES[key];
}

/** Symbol layout shared by native and web: rotate with the map so the nose points along the heading. */
export const VEHICLE_LAYOUT: NonNullable<SymbolLayerSpecification['layout']> = {
  // Chunky up close, smaller when zoomed out to a city view.
  'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.65, 15, 1.05, 18, 1.45],
  'icon-rotation-alignment': 'map',
  'icon-pitch-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
};
