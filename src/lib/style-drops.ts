/**
 * Style drops: $5 add-ons for the live 3D cars, sold one at a time and not included in Pro. To add one:
 * put it here, allow its entitlement in the database, and add its plan to the stripe function and
 * scripts/stripe-setup.mjs (plus a RevenueCat offering of the same name for the phone apps).
 */
export type DropEntitlement = 'drop_afterburner' | 'drop_neon_trails';
export type DropId = 'afterburner' | 'neon_trails';

export type DropOption = { value: string; label: string; color: string };

export type StyleDrop = {
  id: DropId;
  entitlement: DropEntitlement;
  title: string;
  tagline: string;
  icon: string;
  /** which profile column the choice is saved in, so everyone in your convoy sees it */
  column: 'flame_style' | 'trail_style';
  features: [string, string][];
  options: DropOption[];
};

export const STYLE_DROPS: StyleDrop[] = [
  {
    id: 'afterburner',
    entitlement: 'drop_afterburner',
    title: 'Afterburner',
    tagline: 'Pick the fire behind your car.',
    icon: 'fire',
    column: 'flame_style',
    features: [
      ['fire', 'Five exhaust flame colors for your 3D car'],
      ['account-group', 'Everyone in your convoy sees them'],
      ['infinity', 'One-time unlock, yours forever'],
    ],
    options: [
      { value: 'inferno', label: 'Inferno', color: '#ff5a1a' },
      { value: 'plasma', label: 'Plasma', color: '#3fd0ff' },
      { value: 'toxic', label: 'Toxic', color: '#7dff3f' },
      { value: 'violet', label: 'Violet', color: '#b65cff' },
      { value: 'rainbow', label: 'Rainbow', color: '#ff3fa4' },
    ],
  },
  {
    id: 'neon_trails',
    entitlement: 'drop_neon_trails',
    title: 'Neon Trails',
    tagline: 'Leave a streak of light behind you.',
    icon: 'creation',
    column: 'trail_style',
    features: [
      ['creation', 'A glowing light trail behind your 3D car'],
      ['palette-outline', 'Four colors to choose from'],
      ['account-group', 'Everyone in your convoy sees it'],
      ['infinity', 'One-time unlock, yours forever'],
    ],
    options: [
      { value: 'cyan', label: 'Cyan', color: '#2fe6ff' },
      { value: 'magenta', label: 'Magenta', color: '#ff2fb4' },
      { value: 'lime', label: 'Lime', color: '#9dff2f' },
      { value: 'gold', label: 'Gold', color: '#ffc42f' },
    ],
  },
];

export const dropById = (id: string) => STYLE_DROPS.find((d) => d.id === id);

/** A saved flame or trail choice as a color for the renderer; 'rainbow' cycles, unknown values mean none. */
export function dropColor(column: StyleDrop['column'], value: string | null | undefined): string | null {
  if (!value) return null;
  return STYLE_DROPS.find((d) => d.column === column)?.options.find((o) => o.value === value)?.color ?? null;
}
