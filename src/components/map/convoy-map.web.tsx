import 'maplibre-gl/dist/maplibre-gl.css';

import { LngLatBounds, Map as MLMap, Marker, setWorkerUrl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { lineFeature, lineLayers } from './line-style';
import { useMapLook } from './use-map-look';
import type { ConvoyMapProps } from './types';

export type { ConvoyMapProps, MapLine, MapPerson } from './types';

// Served from public/ (see scripts/copy-maplibre-worker.mjs).
setWorkerUrl('/maplibre-gl-worker.mjs');

/**
 * Browser build of the map (maplibre-gl JS) for UI work in `npm run web`. Same tiles and
 * line styles as the native map; no GPS follow mode.
 */
export function ConvoyMap({ style, lines = [], people = [], destination, fit, padding }: ConvoyMapProps) {
  const { styleUrl, glow } = useMapLook();
  const theme = useTheme();
  // A plain div: maplibre's CSS sets `position: relative` on its container, which would
  // override react-native-web's class-based absolute fill.
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const added = useRef<string[]>([]);
  const markers = useRef<Marker[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const m = new MLMap({
      container: container.current!,
      style: styleUrl,
      center: [-98, 39],
      zoom: 3,
      attributionControl: { compact: true },
    });
    m.on('load', () => setLoaded(true));
    map.current = m;
    // Tabs mount hidden (0×0); keep the canvas in sync with the container's real size.
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      m.remove();
      // A theme change rebuilds the map; layers and markers get re-added once it loads.
      setLoaded(false);
      added.current = [];
      markers.current = [];
    };
  }, [styleUrl]);

  useEffect(() => {
    const m = map.current;
    if (!loaded || !m) return;
    for (const id of added.current) {
      for (const layer of m.getStyle().layers ?? []) if (layer.id.startsWith(`${id}-`)) m.removeLayer(layer.id);
      if (m.getSource(id)) m.removeSource(id);
    }
    added.current = [];
    for (const line of lines) {
      const id = `line-${line.id}`;
      m.addSource(id, { type: 'geojson', data: lineFeature(line) });
      for (const l of lineLayers(line, glow)) {
        m.addLayer({ id: `${id}-${l.suffix}`, type: 'line', source: id, layout: l.layout as any, paint: l.paint as any });
      }
      added.current.push(id);
    }
  }, [loaded, lines, glow]);

  useEffect(() => {
    const m = map.current;
    if (!loaded || !m) return;
    for (const mk of markers.current) mk.remove();
    markers.current = people.map((p) => {
      const el = document.createElement('div');
      el.textContent = p.name.slice(0, 1).toUpperCase();
      Object.assign(el.style, {
        width: '32px',
        height: '32px',
        borderRadius: '16px',
        border: '3px solid #fff',
        background: p.color,
        color: '#fff',
        font: '700 14px system-ui',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: p.stale ? '0.45' : '1',
      });
      return new Marker({ element: el }).setLngLat(p.coord).addTo(m);
    });
    if (destination) markers.current.push(new Marker({ color: theme.danger }).setLngLat(destination).addTo(m));
  }, [loaded, people, destination, theme.danger]);

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
