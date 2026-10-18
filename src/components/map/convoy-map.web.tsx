import 'maplibre-gl/dist/maplibre-gl.css';

import { LngLatBounds, Map as MLMap, Marker, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

import { lineFeature, lineLayers } from './line-style';
import { poiLayers, styleHasPlaces } from './poi-layers';
import { useMapLook } from './use-map-look';
import { useSteadyHeading } from './use-steady-heading';
import { buildingsLayer, TILT_3D } from './buildings';
import { cameraFeatures } from './camera-features';
import { CAMERA_LAYOUT, VEHICLE_IMAGES, VEHICLE_LAYOUT, vehicleSprite } from './vehicle-sprites';
import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapMarker, MapPerson } from './types';

// Served from public/ (see scripts/copy-maplibre-worker.mjs).
setWorkerUrl('/maplibre-gl-worker.mjs');

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/** Symbol layers that draw vehicle sprites. Re-run after every style (re)load. */
function addCameraLayer(m: MLMap) {
  for (const kind of ['speed', 'alpr']) {
    const id = `cam-${kind}`;
    if (!m.hasImage(id)) void m.loadImage(`/cameras/${kind}.png`).then((img) => !m.hasImage(id) && m.addImage(id, img.data, { pixelRatio: 3 }));
  }
  if (!m.getSource('cameras')) m.addSource('cameras', { type: 'geojson', data: EMPTY });
  if (!m.getLayer('cameras')) m.addLayer({ id: 'cameras', type: 'symbol', source: 'cameras', minzoom: 11, layout: CAMERA_LAYOUT as any });
}

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
export function ConvoyMap({ style, follow = false, me, cameras = [], tilt3d = false, camera, lines = [], people = [], markers: pins = [], destination, fit, padding }: ConvoyMapProps) {
  const { styleUrl, style: mapStyle, variant, glow, scheme } = useMapLook();
  const theme = useTheme();
  // A plain div: maplibre's CSS sets `position: relative` on its container, which would
  // override react-native-web's class-based absolute fill.
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const added = useRef<string[]>([]);
  const markers = useRef<Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pendingFit = useRef(false);
  const [vehiclesReady, setVehiclesReady] = useState(false);
  const following = useRef(follow);
  const [followingUi, setFollowingUi] = useState(follow);
  /** Compass button: lock the map north-up instead of facing the way you're going. */
  const [northUp, setNorthUp] = useState(false);
  const meRef = useRef(me);
  meRef.current = me;
  const tilt3dRef = useRef(tilt3d);
  tilt3dRef.current = tilt3d;
  /** Where the car is drawn right now (it glides toward each new fix). */
  const shown = useRef<{ coord: [number, number]; heading: number } | null>(null);
  const glide = useRef<number | null>(null);
  const centeredOnce = useRef(false);
  const myHeading = useSteadyHeading(me?.heading);

  useEffect(() => {
    const m = new MLMap({
      container: container.current!,
      style: mapStyle,
      // Open where the driver was last seen; the first GPS fix takes over from there.
      center: useSettings.getState().lastCoord ?? [-98, 39],
      zoom: useSettings.getState().lastCoord ? 14 : 3,
      attributionControl: { compact: true },
    });
    m.on('load', () => {
      setLoaded(true);
      // Nearby places first, so routes and cars draw on top of them.
      if (!styleHasPlaces(styleUrl)) for (const l of poiLayers(scheme === 'dark')) if (!m.getLayer(l.id)) m.addLayer(l as never);
      // Raised buildings sit under cameras and cars; hidden unless the 3D view is on.
      if (!m.getLayer('convoy-buildings-3d')) m.addLayer(buildingsLayer(scheme === 'dark', variant) as never);
      m.setLayoutProperty('convoy-buildings-3d', 'visibility', tilt3dRef.current ? 'visible' : 'none');
      addCameraLayer(m);
      addVehicleLayers(m);
      setVehiclesReady(true);
    });
    // 81 model × paint sprites: load each one only when a car on screen needs it. The @3x renders
    // live in public/vehicles so they stay sharp on high-density screens.
    m.on('styleimagemissing', ({ id }) => {
      if (id.startsWith('blk-')) {
        // Blocks theme textures (fill/line patterns), @3x pixel art from public/themes.
        void m.loadImage(`/themes/blocks/${id.slice(4)}.png`).then((img) => !m.hasImage(id) && m.addImage(id, img.data, { pixelRatio: 3 }));
        return;
      }
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
    const observer = new ResizeObserver(() => {
      m.resize();
      if (pendingFit.current && container.current?.clientHeight) doFit.current();
    });
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
  }, [mapStyle]);

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

  useEffect(() => {
    const m = map.current;
    if (!vehiclesReady || !m) return;
    (m.getSource('cameras') as GeoJSONSource | undefined)?.setData(cameraFeatures(cameras));
  }, [vehiclesReady, cameras]);

  // Vehicle sprites: other drivers and me.
  useEffect(() => {
    const m = map.current;
    if (!vehiclesReady || !m) return;
    (m.getSource('people') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: people.map((p) => point(p.coord, vehicleSprite(p.vehicle, p.paint), p.heading ?? 0, p.stale ? 0.45 : 1)),
    });
    const src = m.getSource('me') as GeoJSONSource | undefined;
    if (!src) return;
    if (!me) {
      shown.current = null;
      src.setData(EMPTY);
      return;
    }
    // Glide from where the car is drawn to the new fix over about a second (fixes arrive ~1/s),
    // turning the short way round, instead of jumping once per GPS update.
    const sprite = vehicleSprite(me.vehicle, me.paint);
    const from = shown.current ?? { coord: me.coord, heading: myHeading };
    const to = { coord: me.coord, heading: myHeading };
    const turn = ((((to.heading - from.heading) % 360) + 540) % 360) - 180;
    const far = Math.abs(from.coord[0] - to.coord[0]) + Math.abs(from.coord[1] - to.coord[1]) > 0.01; // >1 km: just jump
    const start = performance.now();
    const DURATION = far ? 0 : 950;
    if (glide.current != null) cancelAnimationFrame(glide.current);
    const step = (now: number) => {
      const t = DURATION ? Math.min(1, (now - start) / DURATION) : 1;
      const cur = {
        coord: [from.coord[0] + (to.coord[0] - from.coord[0]) * t, from.coord[1] + (to.coord[1] - from.coord[1]) * t] as [number, number],
        heading: from.heading + turn * t,
      };
      shown.current = cur;
      src.setData({ type: 'FeatureCollection', features: [point(cur.coord, sprite, cur.heading)] });
      if (t < 1) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
    return () => {
      if (glide.current != null) cancelAnimationFrame(glide.current);
    };
  }, [vehiclesReady, people, me, myHeading]);

  // Follow switched back on (e.g. a place sheet closed or navigation started): snap back to the driver.
  useEffect(() => {
    following.current = follow;
    setFollowingUi(follow);
    const m = map.current;
    const cur = meRef.current;
    if (follow && loaded && m && cur) m.easeTo({ ...followView(cur), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, loaded]);

  // 3D buildings on/off.
  useEffect(() => {
    const m = map.current;
    if (!loaded || !m || !m.getLayer('convoy-buildings-3d')) return;
    m.setLayoutProperty('convoy-buildings-3d', 'visibility', tilt3d ? 'visible' : 'none');
  }, [loaded, tilt3d]);

  /** Camera for "following you": zoom/tilt from the caller, facing your heading unless north-up. */
  const followView = (cur: NonNullable<typeof me>) => ({
    center: cur.coord,
    zoom: camera?.zoom ?? 16,
    pitch: camera?.pitch ?? (tilt3d ? TILT_3D : 0),
    bearing: !northUp && camera?.heading != null ? camera.heading : 0,
    padding: { top: padding?.top ?? 0, bottom: padding?.bottom ?? 0, left: 0, right: 0 },
  });

  // Follow the driver: jump in on the first fix, then glide along until they pan away.
  const meKey = me ? `${me.coord[0].toFixed(6)},${me.coord[1].toFixed(6)}` : null;
  useEffect(() => {
    const m = map.current;
    if (!loaded || !m || !me) return;
    const pad = { top: padding?.top ?? 0, bottom: padding?.bottom ?? 0, left: 0, right: 0 };
    if (!centeredOnce.current) {
      centeredOnce.current = true;
      if (follow) m.jumpTo(followView(me));
      else if (!fit) m.jumpTo({ center: me.coord, zoom: 16, padding: pad });
      return;
    }
    // Linear and about as long as the gap between fixes, so the camera moves (and turns, and
    // zooms for upcoming turns) continuously with the car instead of in steps.
    if (follow && following.current) m.easeTo({ ...followView(me), duration: 1000, easing: (t) => t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, meKey, camera?.zoom, camera?.pitch, Math.round((camera?.heading ?? 0) / 3), northUp]);

  const fitKey = fit?.key;
  /** Fit the camera to `fit`, or remember to once the map is visible (hidden tabs are 0×0). */
  const doFit = useRef<() => void>(() => {});
  doFit.current = () => {
    const m = map.current;
    if (!m || !fit || fit.points.length === 0) return;
    if (!container.current?.clientHeight) {
      pendingFit.current = true;
      return;
    }
    pendingFit.current = false;
    const bounds = new LngLatBounds(fit.points[0], fit.points[0]);
    for (const p of fit.points) bounds.extend(p);
    // fitBounds adds the follow camera's padding on top of its own, and gives up silently when
    // the total is taller than the map (phones, with the place sheet open). Clear it, and shrink
    // the margins so at least ~140 px of route stays visible.
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const room = container.current.clientHeight - 140;
    let top = (padding?.top ?? 0) + 30;
    let bottom = (padding?.bottom ?? 0) + 30;
    if (top + bottom > room) {
      const k = Math.max(0, room / (top + bottom));
      top = Math.floor(top * k);
      bottom = Math.floor(bottom * k);
    }
    m.fitBounds(bounds, {
      padding: { top, bottom, left: 40, right: 40 },
      duration: 600,
      maxZoom: 15,
      pitch: 0,
      bearing: 0,
    });
  };
  useEffect(() => {
    if (loaded) doFit.current();
  }, [loaded, fitKey]);

  return (
    <View style={[styles.container, style]}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {follow && me && camera?.heading != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={northUp ? 'Face my direction' : 'Keep north up'}
          onPress={() => setNorthUp((v) => !v)}
          style={[styles.compass, { backgroundColor: theme.backgroundElement, top: (padding?.top ?? 0) + Spacing.two }]}>
          <View style={{ transform: [{ rotate: `${northUp ? 0 : -(camera.heading ?? 0)}deg` }], alignItems: 'center' }}>
            <MaterialCommunityIcons name="navigation" size={20} color={northUp ? theme.textSecondary : '#FF3B30'} />
          </View>
          <Text style={[styles.compassN, { color: theme.textSecondary }]}>N</Text>
        </Pressable>
      ) : null}
            {follow && !followingUi && me ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on my location"
          onPress={() => {
            following.current = true;
            setFollowingUi(true);
            const cur = meRef.current;
            const m = map.current;
            if (cur && m) m.easeTo({ ...followView(cur), duration: 600 });
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
  compass: {
    position: 'absolute',
    right: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  } as never,
  compassN: { fontSize: 9, fontWeight: '800', marginTop: -2 },
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
