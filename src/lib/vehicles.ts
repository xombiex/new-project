export type Vehicle = 'car' | 'hatch' | 'sport' | 'classic' | 'suv' | 'van' | 'pickup' | 'jeep' | 'moto';
export type Paint = 'blue' | 'red' | 'orange' | 'yellow' | 'green' | 'purple' | 'white' | 'silver' | 'black';

/**
 * The 3D garage. Car and hatchback are free; the rest are part of the Style Pack.
 * `icon` (MaterialCommunityIcons) is a fallback where a sprite can't be shown.
 */
export const VEHICLES: { value: Vehicle; label: string; icon: string; premium: boolean }[] = [
  { value: 'car', label: 'Sedan', icon: 'car', premium: false },
  { value: 'hatch', label: 'Hatchback', icon: 'car-hatchback', premium: false },
  { value: 'sport', label: 'Sports', icon: 'car-sports', premium: true },
  { value: 'classic', label: 'Classic', icon: 'car-convertible', premium: true },
  { value: 'suv', label: 'SUV', icon: 'car-estate', premium: true },
  { value: 'van', label: 'Van', icon: 'van-passenger', premium: true },
  { value: 'pickup', label: 'Pickup', icon: 'car-pickup', premium: true },
  { value: 'jeep', label: 'Off-road', icon: 'jeepney', premium: true },
  { value: 'moto', label: 'Motorcycle', icon: 'motorbike', premium: true },
];

/** Paint colors, free for everyone. Keep in sync with scripts/vehicle-sprites/index.html. */
export const PAINTS: { value: Paint; label: string; hex: string }[] = [
  { value: 'blue', label: 'Blue', hex: '#1E9BFF' },
  { value: 'red', label: 'Red', hex: '#E5281F' },
  { value: 'orange', label: 'Orange', hex: '#FF8A00' },
  { value: 'yellow', label: 'Yellow', hex: '#FFC400' },
  { value: 'green', label: 'Green', hex: '#2DBE60' },
  { value: 'purple', label: 'Purple', hex: '#8E5CFF' },
  { value: 'white', label: 'White', hex: '#EEF0F3' },
  { value: 'silver', label: 'Silver', hex: '#9AA3AE' },
  { value: 'black', label: 'Black', hex: '#1C1D22' },
];

export function vehicleIcon(v: string | null | undefined): string {
  return VEHICLES.find((x) => x.value === v)?.icon ?? 'car';
}
