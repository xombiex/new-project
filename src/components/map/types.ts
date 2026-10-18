import type { StyleProp, ViewStyle } from 'react-native';

import type { Camera } from '@/lib/cameras';
import type { LngLat } from '@/lib/geo';

export type MapLine = {
  id: string;
  /** one line, or several drawn as a single layer (e.g. every past drive) */
  coords: LngLat[] | LngLat[][];
  color: string;
  width?: number;
  opacity?: number;
  /** 'glow' renders a heat-trail look: red haze → orange glow → hot white core */
  variant?: 'solid' | 'glow' | 'route';
};

export type MapPerson = {
  id: string;
  name: string;
  color: string;
  coord: LngLat;
  heading: number | null;
  /** MaterialCommunityIcons name; falls back to initials */
  icon?: string;
  /** Profile vehicle (car, sport, suv…), drawn as a 3D sprite under the avatar */
  vehicle?: string;
  /** Paint color of that vehicle */
  paint?: string;
  /** Short live label shown in a bubble above the avatar, e.g. "36 MPH" */
  label?: string;
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
  /** Speed and license-plate cameras to draw (from OpenStreetMap) */
  cameras?: Camera[];
  /** Tapped a camera icon */
  onPressCamera?: (camera: Camera) => void;
  /** Show raised 3D buildings */
  tilt3d?: boolean;
  /**
   * Follow-camera target while following the driver: zoom and tilt, and the heading the map should
   * face (null = keep north up). Navigation passes a closer zoom near turns.
   */
  camera?: { zoom: number; pitch: number; heading: number | null };
  /** The signed-in driver, drawn as their 3D vehicle instead of a blue dot. */
  me?: { coord: LngLat; heading: number | null; vehicle?: string | null; paint?: string | null } | null;
  lines?: MapLine[];
  people?: MapPerson[];
  markers?: MapMarker[];
  destination?: LngLat | null;
  /** Fit the camera to these points whenever the key changes (e.g. a trip route). */
  fit?: { key: string; points: LngLat[] } | null;
  /** Extra space reserved by overlays, so followed/fitted content isn't hidden behind them. */
  padding?: { top?: number; bottom?: number };
};
