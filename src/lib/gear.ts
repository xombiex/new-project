/**
 * Curated gear with affiliate links. Links are Amazon *searches* (not specific products),
 * so they never go stale and we never claim a specific product is best.
 * Set EXPO_PUBLIC_AMAZON_TAG to your Associates tracking id to earn commission.
 */
const TAG = process.env.EXPO_PUBLIC_AMAZON_TAG;

export type GearItem = { name: string; why: string; query: string; icon: string };
export type GearCategory = { title: string; items: GearItem[] };

export const GEAR: GearCategory[] = [
  {
    title: 'Mount & power',
    items: [
      { name: 'Magnetic phone mount', why: 'Keeps the map in view so you never hold the phone.', query: 'magnetic car phone mount', icon: 'cellphone-link' },
      { name: 'Wireless charging mount', why: 'Navigation + GPS drain batteries fast.', query: 'wireless charging car phone mount', icon: 'battery-charging-wireless' },
      { name: 'Fast USB-C car charger', why: 'Top up quickly on long drives.', query: 'usb c fast car charger', icon: 'power-plug' },
    ],
  },
  {
    title: 'Group drives',
    items: [
      { name: 'Two-way radios', why: 'Talk to the convoy where there’s no signal.', query: 'gmrs two way radio long range', icon: 'radio-handheld' },
      { name: 'Motorcycle intercom', why: 'Hands-free chat between riders.', query: 'motorcycle bluetooth intercom', icon: 'motorbike' },
    ],
  },
  {
    title: 'Record the drive',
    items: [
      { name: 'Front + rear dash cam', why: 'Capture the scenery and protect yourself.', query: 'front and rear dash cam', icon: 'cctv' },
      { name: 'Dash cam hardwire kit', why: 'Clean install, no cables across the dash.', query: 'dash cam hardwire kit', icon: 'cable-data' },
    ],
  },
  {
    title: 'Be ready',
    items: [
      { name: 'Portable jump starter', why: 'Start a dead battery without another car.', query: 'portable car jump starter', icon: 'car-battery' },
      { name: 'Cordless tire inflator', why: 'Fix low pressure anywhere.', query: 'cordless tire inflator', icon: 'tire' },
      { name: 'Roadside emergency kit', why: 'Triangles, gloves, first aid, all in one.', query: 'roadside emergency kit car', icon: 'medical-bag' },
    ],
  },
];

export const affiliateEnabled = Boolean(TAG);

export function gearUrl(query: string) {
  const params = new URLSearchParams({ k: query });
  if (TAG) params.set('tag', TAG);
  return `https://www.amazon.com/s?${params}`;
}
