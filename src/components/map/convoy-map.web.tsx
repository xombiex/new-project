import 'maplibre-gl/dist/maplibre-gl.css';

import { LngLatBounds, Map as MLMap, Marker, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

import { lineFeature, lineLayers } from './line-style';
import { poiLayers, styleHasPlaces } from './poi-layers';
import { useMapLook } from './use-map-look';
import { useSteadyHeading } from './use-steady-heading';
import { VEHICLE_IMAGES, VEHICLE_LAYOUT, vehicleSprite } from './vehicle-sprites';
import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapMarker, MapPerson } from './types';

// Served from public/ (see scripts/copy-maplibre-worker.mjs).
setWorkerUrl('/maplibre-gl-worker.mjs');

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/** Symbol layers that draw vehicle sprites. Re-run after every style (re)load. */
function addVehicleLayers(m: MLMap) {
  for (const id of ['people', 'me']) {
    if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: EMPTY });
    if (!m.getLayer(`${id}-vehicles`)) {
      m.addLayer({
        id: `${id}-vehicles`,
        type: 'symbol',
        source: id,
        layout: { ...VEHICLE_LAYOUT, 'icon-image': ['get', 'sprite'], 'icon-rotate': ['get', 'heading'] } as any,
        paint: { 'icon-opacity': ['get', 'opacity'] },
      });
    }
  }
}

const point = (coord: [number, number], sprite: string, heading: number, opacity = 1) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: coord },
  properties: { sprite, heading, opacity },
});

/**
 * Browser build of the map (maplibre-gl JS). Same tiles, line styles and 3D vehicle sprites as
 * the native map; follows the driver until they pan away.
 */
export function ConvoyMap({ style, follow = false, me, lines = [], people = [], markers: pins = [], destination, fit, padding }: ConvoyMapProps) {
  const { styleUrl, glow, scheme } = useMapLook();
  const theme = useTheme();
  // A plain div: maplibre's CSS sets `position: relative` on its container, which would
  // override react-native-web's class-based absolute fill.
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const added = useRef<string[]>([]);
  const markers = useRef<Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [vehiclesReady, setVehiclesReady] = useState(false);
  const following = useRef(follow);
  const [followingUi, setFollowingUi] = useState(follow);
  const meRef = useRef(me);
  meRef.current = me;
  const centeredOnce = useRef(false);
  const myHeading = useSteadyHeading(me?.heading);

  useEffect(() => {
    const m = new MLMap({
      container: container.current!,
      style: styleUrl,
      // Open where the driver was last seen; the first GPS fix takes over from there.
      center: useSettings.getState().lastCoord ?? [-98, 39],
      zoom: useSettings.getState().lastCoord ? 14 : 3,
      attributionControl: { compact: true },
    });
    m.on('load', () => {
      setLoaded(true);
      // Nearby places first, so routes and cars draw on top of them.
      if (!styleHasPlaces(styleUrl)) for (const l of poiLayers(scheme === 'dark')) if (!m.getLayer(l.id)) m.addLayer(l as never);
      addVehicleLayers(m);
      setVehiclesReady(true);
    });
    // 81 model × paint sprites: load each one only when a car on screen needs it. The @3x renders
    // live in public/vehicles so they stay sharp on high-density screens.
    m.on('styleimagemissing', ({ id }) => {
      if (!id.startsWith('vehicle-') || !(id in VEHICLE_IMAGES)) return;
      void m.loadImage(`/vehicles/${id.replace('vehicle-', '')}.png`).then((img) => {
        if (!m.hasImage(id)) m.addImage(id, img.data, { pixelRatio: 3 });
      });
    });
    // Panning by hand stops follow mode (like the native recenter behavior).
    m.on('dragstart', () => {
      following.current = false;
      setFollowingUi(false);
    });
    map.current = m;
    // Tabs mount hidden (0×0); keep the canvas in sync with the container's real size.
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      m.remove();
      // A theme change rebuilds the map; layers and markers get re-added once it loads.
      setLoaded(false);
      setVehiclesReady(false);
      centeredOnce.current = false;
      added.current = [];
      markers.current = [];
    };
  }, [styleUrl]);

  useEffect(() => {
    const m = map.current;
    if (!loaded || !m) return;
    const sync = () => {
      if (!m.isStyleLoaded()) {
        m.once('idle', sync);
        return;
      }
      const wanted = new Set(lines.map((l) => `line-${l.id}`));
      // Remove lines that went away.
      for (const id of added.current.filter((x) => !wanted.has(x))) {
        for (const layer of m.getStyle().layers ?? []) if (layer.id.startsWith(`${id}-`)) m.removeLayer(layer.id);
        if (m.getSource(id)) m.removeSource(id);
      }
      // Update in place when possible (replay animates many times a second).
      for (const line of lines) {
        const id = `line-${line.id}`;
        const source = m.getSource(id) as GeoJSONSource | undefined;
        if (source) source.setData(lineFeature(line));
        else m.addSource(id, { type: 'geojson', data: lineFeature(line) });
        for (const l of lineLayers(line, glow)) {
          const layerId = `${id}-${l.suffix}`;
          if (m.getLayer(layerId)) {
            for (const [k, v] of Object.entries(l.paint)) m.setPaintProperty(layerId, k as 'line-color', v as string);
          } else {
            m.addLayer({ id: layerId, type: 'line', source: id, layout: l.layout as any, paint: l.paint as any });
          }
        }
      }
      added.current = [...wanted];
    };
    sync();
  }, [loaded, lines, glow]);

  useEffect(() => {
    const m = map.current;
    if (!loaded || !m) return;
    for (const mk of markers.current) mk.remove();
    markers.current = people.map((p) => {
      const wrap = document.createElement('div');
      Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', opacity: p.stale ? '0.45' : '1' });
      if (p.label) {
        const pill = document.createElement('div');
        pill.textContent = p.label;
        Object.assign(pill.style, {
          background: p.color,
          color: '#fff',
          font: '800 11px system-ui',
          padding: '2px 7px',
          borderRadius: '10px',
          border: '1.5px solid #fff',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        });
        wrap.appendChild(pill);
      }
      const el = document.createElement('div');
      el.textContent = p.name.slice(0, 1).toUpperCase();
      Object.assign(el.style, {
        width: '30px',
        height: '30px',
        borderRadius: '15px',
        border: `3px solid ${p.color}`,
        boxShadow: '0 0 0 2px #fff',
        background: p.color,
        color: '#fff',
        font: '700 13px system-ui',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      });
      wrap.appendChild(el);
      // Floats above the vehicle sprite drawn by the people-vehicles layer.
      return new Marker({ element: wrap, anchor: 'bottom', offset: [0, -16] }).setLngLat(p.coord).addTo(m);
    });
    for (const pin of pins) {
      const el = document.createElement('div');
      Object.assign(el.style, { width: '30px', height: '30px', borderRadius: '15px', border: '2px solid #fff', background: pin.color, cursor: 'pointer' });
      if (pin.onPress) el.addEventListener('click', pin.onPress);
      markers.current.push(new Marker({ element: el }).setLngLat(pin.coord).addTo(m));
    }
    if (destination) markers.current.push(new Marker({ color: theme.danger }).setLngLat(destination).addTo(m));
  }, [loaded, people, pins, destination, theme.danger]);

  // Vehicle sprites: other drivers and me.
  useEffect(() => {
    const m = map.current;
    if (!vehiclesReady || !m) return;
    (m.getSource('people') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: people.map((p) => point(p.coord, vehicleSprite(p.vehicle, p.paint), p.heading ?? 0, p.stale ? 0.45 : 1)),
    });
    (m.getSource('me') as GeoJSONSource | undefined)?.setData(
      me ? { type: 'FeatureCollection', features: [point(me.coord, vehicleSprite(me.vehicle, me.paint), myHeading)] } : EMPTY
    );
  }, [vehiclesReady, people, me, myHeading]);

  // Follow the driver: jump in on the first fix, then glide along until they pan away.
  const meKey = me ? `${me.coord[0].toFixed(6)},${me.coord[1].toFixed(6)}` : null;
  useEffect(() => {
    const m = map.current;
    if (!loaded || !m || !me) return;
    const pad = { top: padding?.top ?? 0, bottom: padding?.bottom ?? 0, left: 0, right: 0 };
    if (!centeredOnce.current) {
      centeredOnce.current = true;
      if (follow || !fit) m.jumpTo({ center: me.coord, zoom: 16, padding: pad });
      return;
    }
    if (follow && following.current) m.easeTo({ center: me.coord, padding: pad, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, meKey]);

  const fitKey = fit?.key;
  useEffect(() => {
    const m = map.current;
    if (!loaded || !m || !fit || fit.points.length === 0) return;
    const bounds = new LngLatBounds(fit.points[0], fit.points[0]);
    for (const p of fit.points) bounds.extend(p);
    m.fitBounds(bounds, {
      padding: { top: (padding?.top ?? 0) + 40, bottom: (padding?.bottom ?? 0) + 40, left: 40, right: 40 },
      duration: 600,
      maxZoom: 15,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fitKey]);

  return (
    <View style={[styles.container, style]}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {follow && !followingUi && me ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on my location"
          onPress={() => {
            following.current = true;
            setFollowingUi(true);
            const cur = meRef.current;
            const m = map.current;
            if (cur && m) {
              m.easeTo({
                center: cur.coord,
                zoom: Math.max(m.getZoom(), 15),
                padding: { top: padding?.top ?? 0, bottom: padding?.bottom ?? 0, left: 0, right: 0 },
                duration: 600,
              });
            }
          }}
          style={[styles.recenter, { backgroundColor: theme.backgroundElement, bottom: (padding?.bottom ?? 0) + Spacing.three + 68 }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={24} color={theme.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  recenter: {
    position: 'absolute',
    right: Spacing.three,
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  } as never,
});
