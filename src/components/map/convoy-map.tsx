import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
  type CameraRef,
  type LineLayerSpecification,
  type TrackUserLocation,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { lineFeature, lineLayers } from './line-style';
import { useMapLook } from './use-map-look';
import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapPerson } from './types';

export function ConvoyMap({
  style,
  follow = false,
  showUser = true,
  lines = [],
  people = [],
  destination,
  fit,
  padding,
}: ConvoyMapProps) {
  const { styleUrl, glow } = useMapLook();
  const theme = useTheme();
  const camera = useRef<CameraRef>(null);
  const [tracking, setTracking] = useState<TrackUserLocation | undefined>(follow ? 'course' : undefined);
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
          initialViewState={{ zoom: 15 }}
          trackUserLocation={tracking}
          padding={{ top: edge.top, bottom: edge.bottom, left: 0, right: 0 }}
          onTrackUserLocationChange={(e) => setTracking(e.nativeEvent.trackUserLocation ?? undefined)}
        />

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

        {destination ? (
          <Marker id="destination" lngLat={destination} anchor="bottom">
            <MaterialCommunityIcons name="map-marker" size={44} color={theme.danger} />
          </Marker>
        ) : null}

        {people.map((p) => (
          <Marker key={p.id} id={`person-${p.id}`} lngLat={p.coord} anchor="center">
            <View style={[styles.person, p.stale && { opacity: 0.45 }]}>
              {p.heading != null && !p.stale ? (
                <View style={[styles.headingWrap, { transform: [{ rotate: `${p.heading}deg` }] }]}>
                  <MaterialCommunityIcons name="navigation" size={16} color={p.color} />
                </View>
              ) : null}
              <View style={styles.avatarRing}>
                {p.icon ? (
                  <View style={[styles.vehicle, { backgroundColor: p.color }]}>
                    <MaterialCommunityIcons name={p.icon as 'car'} size={18} color="#fff" />
                  </View>
                ) : (
                  <Avatar name={p.name} color={p.color} size={32} />
                )}
              </View>
            </View>
          </Marker>
        ))}

        {showUser ? <UserLocation heading animated /> : null}
      </Map>

      {follow && tracking == null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on my location"
          onPress={() => setTracking('course')}
          style={[styles.recenter, { backgroundColor: theme.backgroundElement, bottom: (padding?.bottom ?? 0) + Spacing.three }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={24} color={theme.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  person: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  headingWrap: { ...StyleSheet.absoluteFill, alignItems: 'center' },
  avatarRing: { borderRadius: 20, borderWidth: 3, borderColor: '#fff' },
  vehicle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
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
