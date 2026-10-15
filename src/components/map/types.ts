import type { StyleProp, ViewStyle } from 'react-native';

import type { LngLat } from '@/lib/geo';

export type MapLine = { id: string; coords: LngLat[]; color: string; width?: number; opacity?: number };

export type MapPerson = {
  id: string;
  name: string;
  color: string;
  coord: LngLat;
  heading: number | null;
  /** dimmed when the position is old or the person is offline */
  stale?: boolean;
};

export type ConvoyMapProps = {
  style?: StyleProp<ViewStyle>;
  /** Keep the camera on the user (driving mode). The user can pan away; a recenter button appears. */
  follow?: boolean;
  showUser?: boolean;
  lines?: MapLine[];
  people?: MapPerson[];
  destination?: LngLat | null;
  /** Fit the camera to these points whenever the key changes (e.g. a trip route). */
  fit?: { key: string; points: LngLat[] } | null;
  /** Extra space reserved by overlays, so followed/fitted content isn't hidden behind them. */
  padding?: { top?: number; bottom?: number };
};
