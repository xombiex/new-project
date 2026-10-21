/** One-tap convoy calls: shown to everyone in the drive and read out loud, so nobody types while driving. */
export type QuickCallKind = 'gas' | 'pullover' | 'police' | 'slow' | 'follow' | 'food' | 'restroom' | 'hazard';

export type QuickCall = { kind: QuickCallKind; label: string; icon: string; color: string; spoken: string };

export const QUICK_CALLS: QuickCall[] = [
  { kind: 'gas', label: 'Need gas', icon: 'gas-station', color: '#0A84FF', spoken: 'needs gas' },
  { kind: 'pullover', label: 'Pull over', icon: 'car-brake-alert', color: '#FF9F0A', spoken: 'wants to pull over' },
  { kind: 'police', label: 'Cop ahead', icon: 'police-badge', color: '#5E5CE6', spoken: 'says police ahead' },
  { kind: 'slow', label: 'Slow down', icon: 'speedometer-slow', color: '#FF453A', spoken: 'says slow down' },
  { kind: 'follow', label: 'Follow me', icon: 'arrow-right-bold-circle', color: '#30D158', spoken: 'says follow me' },
  { kind: 'food', label: 'Food stop', icon: 'food', color: '#FF7A45', spoken: 'wants a food stop' },
  { kind: 'restroom', label: 'Restroom', icon: 'human-male-female', color: '#64D2FF', spoken: 'needs a restroom stop' },
  { kind: 'hazard', label: 'Hazard', icon: 'alert', color: '#FFD60A', spoken: 'spotted a hazard' },
];

export const quickCall = (kind: string): QuickCall | undefined => QUICK_CALLS.find((c) => c.kind === kind);

/** Don't let one person spam the group. */
export const CALL_COOLDOWN_MS = 4_000;
/** How long a call stays on screen. */
export const CALL_SHOW_MS = 8_000;
