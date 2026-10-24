import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  Marker,
  RasterDEMSource,
  RasterSource,
  UserLocation,
  type CameraRef,
  type FillExtrusionLayerSpecification,
  type HillshadeLayerSpecification,
  type LineLayerSpecification,
  type SymbolLayerSpecification,
  type TrackUserLocation,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

import { lineFeature, lineLayers } from './line-style';
import { poiLayers, styleHasPlaces } from './poi-layers';
import { useMapLook } from './use-map-look';
import { useSteadyHeading } from './use-steady-heading';
import { buildingsLayer, TILT_3D } from './buildings';
import { cameraFeatures } from './camera-features';
import {
  DEM_ATTRIBUTION,
  DEM_MAXZOOM,
  DEM_SOURCE,
  DEM_TILES,
  HILLSHADE_BEFORE,
  HILLSHADE_LAYER,
  hillshadePaint,
  RADAR_ATTRIBUTION,
  RADAR_LAYER,
  RADAR_OPACITY,
  RADAR_REFRESH_MS,
  RADAR_SOURCE,
  radarTiles,
} from './overlays';
import { BLOCK_IMAGES, CAMERA_IMAGES, CAMERA_LAYOUT, VEHICLE_IMAGES, VEHICLE_LAYOUT, vehicleSprite } from './vehicle-sprites';
import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapMarker, MapPerson } from './types';

export function ConvoyMap({
  style,
  follow = false,
  showUser = true,
  me,
  cameras = [],
  onPressCamera,
  tilt3d = false,
  camera: followCamera,
  lines = [],
  people = [],
  markers = [],
  destination,
  fit,
  padding,
}: ConvoyMapProps) {
  const { styleUrl, style: mapStyle, variant, glow, scheme } = useMapLook();
  const places = useMemo(() => (styleHasPlaces(styleUrl) ? [] : poiLayers(scheme === 'dark')), [styleUrl, scheme]);
  const theme = useTheme();
  const lastCoord = useSettings((s) => s.lastCoord);
  const terrain = useSettings((s) => s.terrain);
  const radar = useSettings((s) => s.radar);
  // A new radar sweep every few minutes (the tile URLs change, so the source is rebuilt).
  const [radarUrls, setRadarUrls] = useState(() => radarTiles());
  useEffect(() => {
    if (!radar) return;
    setRadarUrls(radarTiles());
    const id = setInterval(() => setRadarUrls(radarTiles()), RADAR_REFRESH_MS);
    return () => clearInterval(id);
  }, [radar]);
  const camera = useRef<CameraRef>(null);
  // 'course' turns the map to the way you're driving; 'default' keeps north up (compass button).
  const [northUp, setNorthUp] = useState(false);
  const followMode: TrackUserLocation = northUp || followCamera?.heading === null ? 'default' : 'course';
  const [tracking, setTracking] = useState<TrackUserLocation | undefined>(follow ? 'course' : undefined);
  const myHeading = useSteadyHeading(me?.heading);
  const cameraData = useMemo(() => cameraFeatures(cameras), [cameras]);
  const peopleData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: people.map((p) => ({
        type: 'Feature' as const,
        id: p.id,
        geometry: { type: 'Point' as const, coordinates: p.coord },
        properties: { sprite: vehicleSprite(p.vehicle, p.paint), heading: p.heading ?? 0, opacity: p.stale ? 0.45 : 1 },
      })),
    }),
    [people]
  );
  const edge = { top: (padding?.top ?? 0) + 40, bottom: (padding?.bottom ?? 0) + 40, left: 40, right: 40 };

  useEffect(() => setTracking(follow ? followMode : undefined), [follow, followMode]);

  // Moved the map by hand: snap back to following after a few seconds of not touching it.
  const realign = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRealign = () => {
    if (realign.current) clearTimeout(realign.current);
    realign.current = follow ? setTimeout(() => setTracking(followMode), REALIGN_MS) : null;
  };
  useEffect(() => {
    if (follow && tracking == null) scheduleRealign();
    return () => {
      if (realign.current) clearTimeout(realign.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, tracking, followMode]);

  const fitKey = fit?.key;
  useEffect(() => {
    if (!fit || fit.points.length === 0) return;
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of fit.points) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    setTracking(undefined);
    camera.current?.fitBounds([w, s, e, n], { padding: edge, duration: 600 });
    // Only refit when the caller's key changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <View style={[styles.container, style]}>
      <Map
        style={StyleSheet.absoluteFill}
        // The JSON for built themes uses maplibre-gl's copy of the style-spec types; same shape.
        mapStyle={mapStyle as never}
        compass={false}
        logo={false}
        attribution
        attributionPosition={{ bottom: (padding?.bottom ?? 0) + 8, left: 8 }}
        onRegionIsChanging={(e) => {
          if (e.nativeEvent.userInteraction && follow && tracking == null) scheduleRealign();
        }}>
        <Camera
          ref={camera}
          initialViewState={lastCoord ? { center: lastCoord, zoom: 15 } : { zoom: 3 }}
          trackUserLocation={tracking}
          // Following you: the caller's zoom and tilt (closer near turns); flat for overviews and fitted routes.
          pitch={tracking ? (followCamera?.pitch ?? (tilt3d ? TILT_3D : 0)) : 0}
          zoom={tracking && followCamera ? followCamera.zoom : undefined}
          padding={{ top: edge.top, bottom: edge.bottom, left: 0, right: 0 }}
          onTrackUserLocationChange={(e) => setTracking(e.nativeEvent.trackUserLocation ?? undefined)}
        />

        <Images images={{ ...VEHICLE_IMAGES, ...CAMERA_IMAGES, ...BLOCK_IMAGES }} />

        {/* Hills under roads and buildings; radar over the base map but under everything of ours. */}
        {terrain ? (
          <RasterDEMSource id={DEM_SOURCE} tiles={DEM_TILES} encoding="terrarium" tileSize={256} maxzoom={DEM_MAXZOOM} attribution={DEM_ATTRIBUTION}>
            <Layer id={HILLSHADE_LAYER} type="hillshade" beforeId={HILLSHADE_BEFORE} paint={hillshadePaint(scheme === 'dark', variant) as HillshadeLayerSpecification['paint']} />
          </RasterDEMSource>
        ) : null}
        {radar ? (
          <RasterSource key={radarUrls[0]} id={RADAR_SOURCE} tiles={radarUrls} tileSize={256} maxzoom={12} attribution={RADAR_ATTRIBUTION}>
            <Layer id={RADAR_LAYER} type="raster" paint={{ 'raster-opacity': RADAR_OPACITY, 'raster-fade-duration': 0 }} />
          </RasterSource>
        ) : null}

        {tilt3d ? (
          <Layer
            id="convoy-buildings-3d"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            minzoom={15}
            paint={buildingsLayer(scheme === 'dark', variant).paint as FillExtrusionLayerSpecification['paint']}
          />
        ) : null}

        {/* Nearby places from the base map's own data, under routes and cars. */}
        {places.map((l) => (
          <Layer
            key={l.id}
            id={l.id}
            type="symbol"
            source={l.source}
            source-layer={l['source-layer']}
            minzoom={l.minzoom}
            filter={l.filter as never}
            layout={l.layout as SymbolLayerSpecification['layout']}
            paint={l.paint as SymbolLayerSpecification['paint']}
          />
        ))}

        {lines.map((line) => (
          <GeoJSONSource key={line.id} id={`line-${line.id}`} data={lineFeature(line)}>
            {lineLayers(line, glow).map((l) => (
              <Layer
                key={l.suffix}
                id={`line-${line.id}-${l.suffix}`}
                type="line"
                layout={l.layout as LineLayerSpecification['layout']}
                paint={l.paint as LineLayerSpecification['paint']}
              />
            ))}
          </GeoJSONSource>
        ))}

        {markers.map((mk) => (
          <Marker key={mk.id} id={`marker-${mk.id}`} lngLat={mk.coord} anchor="center" onPress={mk.onPress}>
            <View style={[styles.reportPin, { backgroundColor: mk.color }]}>
              <MaterialCommunityIcons name={mk.icon as 'alert'} size={18} color="#fff" />
            </View>
          </Marker>
        ))}

        {destination ? (
          <Marker id="destination" lngLat={destination} anchor="bottom">
            <MaterialCommunityIcons name="map-marker" size={44} color={theme.danger} />
          </Marker>
        ) : null}

        <GeoJSONSource
          id="cameras"
          data={cameraData}
          onPress={(e) => {
            const id = e.nativeEvent.features?.[0]?.properties?.id;
            const cam = cameras.find((c) => c.id === id);
            if (cam) onPressCamera?.(cam);
          }}>
          <Layer type="symbol" id="cameras" minzoom={10} layout={CAMERA_LAYOUT as SymbolLayerSpecification['layout']} />
        </GeoJSONSource>

        <GeoJSONSource id="people" data={peopleData}>
          <Layer
            type="symbol"
            id="people-vehicles"
            layout={{ ...VEHICLE_LAYOUT, 'icon-image': ['get', 'sprite'], 'icon-rotate': ['get', 'heading'] } as SymbolLayerSpecification['layout']}
            paint={{ 'icon-opacity': ['get', 'opacity'] }}
          />
        </GeoJSONSource>

        {people.map((p) => (
          <Marker key={p.id} id={`person-${p.id}`} lngLat={p.coord} anchor="bottom" offset={[0, -14]}>
            <View style={[styles.person, p.stale && { opacity: 0.45 }]}>
              {p.label ? (
                <View style={[styles.speedPill, { backgroundColor: p.color }]}>
                  <Text style={styles.speedText}>{p.label}</Text>
                </View>
              ) : null}
              <View style={[styles.avatarRing, { borderColor: p.color }]}>
                <Avatar name={p.name} color={p.color} size={30} />
              </View>
              <View style={[styles.pinTip, { borderTopColor: p.color }]} />
            </View>
          </Marker>
        ))}

        {showUser ? (
          <UserLocation animated>
            {/* Replaces the default blue dot with the driver's 3D vehicle, nose along the heading. */}
            <Layer
              type="symbol"
              id="me-vehicle"
              source="mlrn-user-location"
              layout={{ ...VEHICLE_LAYOUT, 'icon-image': vehicleSprite(me?.vehicle, me?.paint), 'icon-rotate': myHeading } as SymbolLayerSpecification['layout']}
            />
          </UserLocation>
        ) : null}
      </Map>

      {follow && tracking != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={northUp ? 'Face my direction' : 'Keep north up'}
          onPress={() => setNorthUp((v) => !v)}
          style={[styles.compass, { backgroundColor: theme.backgroundElement, top: (padding?.top ?? 0) + Spacing.two }]}>
          <MaterialCommunityIcons name={northUp ? 'navigation-variant-outline' : 'navigation-variant'} size={22} color={northUp ? theme.textSecondary : '#FF3B30'} />
        </Pressable>
      ) : null}

      {follow && tracking == null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on my location"
          onPress={() => setTracking(followMode)}
          style={[styles.recenter, { backgroundColor: theme.accent, bottom: (padding?.bottom ?? 0) + RECENTER_OFFSET }]}>
          <MaterialCommunityIcons name="navigation-variant" size={20} color="#fff" />
          <Text style={styles.recenterText}>Re-center</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Above the speed dial and the side buttons that sit on top of the bottom sheet. */
const RECENTER_OFFSET = 140;
/** Follow resumes this long after you stop moving the map. */
const REALIGN_MS = 8000;

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  person: { alignItems: 'center' },
  speedPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, marginBottom: 3, borderWidth: 1.5, borderColor: '#fff' },
  speedText: { color: '#fff', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  avatarRing: { borderRadius: 20, borderWidth: 3, backgroundColor: '#fff' },
  pinTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
  reportPin: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  compass: {
    position: 'absolute',
    right: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenter: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 44,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenterText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
