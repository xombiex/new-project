export type Vehicle = 'car' | 'sport' | 'suv' | 'pickup' | 'moto' | 'jeep';

/** Icons are MaterialCommunityIcons names. Everything except "car" is part of the style pack. */
export const VEHICLES: { value: Vehicle; label: string; icon: string; premium: boolean }[] = [
  { value: 'car', label: 'Car', icon: 'car', premium: false },
  { value: 'sport', label: 'Sports', icon: 'car-sports', premium: true },
  { value: 'suv', label: 'SUV', icon: 'car-estate', premium: true },
  { value: 'pickup', label: 'Pickup', icon: 'car-pickup', premium: true },
  { value: 'moto', label: 'Motorcycle', icon: 'motorbike', premium: true },
  { value: 'jeep', label: 'Off-road', icon: 'jeepney', premium: true },
];

export function vehicleIcon(v: string | null | undefined): string {
  return VEHICLES.find((x) => x.value === v)?.icon ?? 'car';
}
