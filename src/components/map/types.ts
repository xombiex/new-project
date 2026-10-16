import type { StyleProp, ViewStyle } from 'react-native';

import type { LngLat } from '@/lib/geo';

export type MapLine = {
  id: string;
  /** one line, or several drawn as a single layer (e.g. every past drive) */
  coords: LngLat[] | LngLat[][];
  color: string;
  width?: number;
  opacity?: number;
  /** 'glow' renders a heat-trail look: red haze → orange glow → hot white core */
  variant?: 'solid' | 'glow';
};

export type MapPerson = {
  id: string;
  name: string;
  color: string;
  coord: LngLat;
  heading: number | null;
  /** MaterialCommunityIcons name; falls back to initials */
  icon?: string;
  /** dimmed when the position is old or the person is offline */
  stale?: boolean;
};

export type MapMarker = {
  id: string;
  coord: LngLat;
  /** MaterialCommunityIcons name */
  icon: string;
  color: string;
  onPress?: () => void;
};

export type ConvoyMapProps = {
  style?: StyleProp<ViewStyle>;
  /** Keep the camera on the user (driving mode). The user can pan away; a recenter button appears. */
  follow?: boolean;
  showUser?: boolean;
  lines?: MapLine[];
  people?: MapPerson[];
  markers?: MapMarker[];
  destination?: LngLat | null;
  /** Fit the camera to these points whenever the key changes (e.g. a trip route). */
  fit?: { key: string; points: LngLat[] } | null;
  /** Extra space reserved by overlays, so followed/fitted content isn't hidden behind them. */
  padding?: { top?: number; bottom?: number };
};
