import type { Pin } from '@/store/places';

type Look = { icon: string; color: string };

/** Apple Maps–style colored circles: house for Home, briefcase for Work, then by kind of place. */
export function pinLook(pin: Pin): Look {
  if (pin.kind === 'home') return { icon: 'home', color: '#4FC3F7' };
  if (pin.kind === 'work') return { icon: 'briefcase', color: '#A47A5B' };
  return placeLook(pin.place.category);
}

export function placeLook(category?: string): Look {
  const c = (category ?? '').toLowerCase();
  if (/restaurant|fast food|food|pizza|burger/.test(c)) return { icon: 'silverware-fork-knife', color: '#FF9F0A' };
  if (/cafe|coffee/.test(c)) return { icon: 'coffee', color: '#B07A4F' };
  if (/bar|pub/.test(c)) return { icon: 'glass-cocktail', color: '#FF7A45' };
  if (/fuel|gas|charging/.test(c)) return { icon: 'gas-station', color: '#0A84FF' };
  if (/theme park|attraction|zoo|aquarium|museum/.test(c)) return { icon: 'ferris-wheel', color: '#FF2D55' };
  if (/hotel|motel|hostel|guest/.test(c)) return { icon: 'bed', color: '#5E5CE6' };
  if (/park|garden|nature|forest|playground/.test(c)) return { icon: 'tree', color: '#4CC764' };
  if (/cemetery|grave/.test(c)) return { icon: 'flower-tulip', color: '#9A9DA6' };
  if (/school|college|university/.test(c)) return { icon: 'school', color: '#8E5CFF' };
  if (/hospital|clinic|doctor|pharmacy/.test(c)) return { icon: 'hospital-box', color: '#FF453A' };
  if (/store|shop|supermarket|mall/.test(c)) return { icon: 'shopping', color: '#FFCC00' };
  if (/gym|fitness|sport|stadium/.test(c)) return { icon: 'dumbbell', color: '#30B0C7' };
  if (/parking/.test(c)) return { icon: 'parking', color: '#0A84FF' };
  return { icon: 'star', color: '#FF375F' };
}
