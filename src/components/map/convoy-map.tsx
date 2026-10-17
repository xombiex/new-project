import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  Marker,
  UserLocation,
  type CameraRef,
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
import { useMapLook } from './use-map-look';
import { useSteadyHeading } from './use-steady-heading';
import { VEHICLE_IMAGES, VEHICLE_LAYOUT, vehicleSprite } from './vehicle-sprites';
import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapMarker, MapPerson } from './types';

export function ConvoyMap({
  style,
  follow = false,
  showUser = true,
  me,
  lines = [],
  people = [],
  markers = [],
  destination,
  fit,
  padding,
}: ConvoyMapProps) {
  const { styleUrl, glow } = useMapLook();
  const theme = useTheme();
  const lastCoord = useSettings((s) => s.lastCoord);
  const camera = useRef<CameraRef>(null);
  const [tracking, setTracking] = useState<TrackUserLocation | undefined>(follow ? 'course' : undefined);
  const myHeading = useSteadyHeading(me?.heading);
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

  useEffect(() => setTracking(follow ? 'course' : undefined), [follow]);

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
        mapStyle={styleUrl}
        compass={false}
        logo={false}
        attribution
        attributionPosition={{ bottom: (padding?.bottom ?? 0) + 8, left: 8 }}>
        <Camera
          ref={camera}
          initialViewState={lastCoord ? { center: lastCoord, zoom: 15 } : { zoom: 3 }}
          trackUserLocation={tracking}
          padding={{ top: edge.top, bottom: edge.bottom, left: 0, right: 0 }}
          onTrackUserLocationChange={(e) => setTracking(e.nativeEvent.trackUserLocation ?? undefined)}
        />

        <Images images={VEHICLE_IMAGES} />

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

      {follow && tracking == null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on my location"
          onPress={() => setTracking('course')}
          style={[styles.recenter, { backgroundColor: theme.backgroundElement, bottom: (padding?.bottom ?? 0) + RECENTER_OFFSET }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={24} color={theme.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Above the screens' floating action button (56pt + gap), so the two never overlap. */
const RECENTER_OFFSET = Spacing.three + 68;

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  person: { alignItems: 'center' },
  speedPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, marginBottom: 3, borderWidth: 1.5, borderColor: '#fff' },
  speedText: { color: '#fff', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  avatarRing: { borderRadius: 20, borderWidth: 3, backgroundColor: '#fff' },
  pinTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
  reportPin: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  recenter: {
    position: 'absolute',
    right: Spacing.three,
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
