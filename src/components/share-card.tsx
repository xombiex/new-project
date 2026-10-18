import { forwardRef, useMemo, type ComponentRef } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { Defs, LinearGradient, Polyline, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import type { LngLat } from '@/lib/geo';
import { GLOW_PRESETS, type GlowPalette } from '@/lib/glow';

export type CardStyle = 'night' | 'day' | 'neon' | 'minimal';

export const CARD_STYLES: { value: CardStyle; label: string; premium: boolean }[] = [
  { value: 'night', label: 'Night', premium: false },
  { value: 'day', label: 'Day', premium: false },
  { value: 'neon', label: 'Neon', premium: true },
  { value: 'minimal', label: 'Minimal', premium: true },
];

export const LOOK: Record<CardStyle, { bg: [string, string]; text: string; sub: string; glow: GlowPalette; speed: string }> = {
  night: { bg: ['#05070D', '#151A26'], text: '#FFFFFF', sub: '#A1A1AA', glow: GLOW_PRESETS.ember.dark, speed: '#FFA630' },
  day: { bg: ['#FFFFFF', '#EEF1F5'], text: '#0A0A0B', sub: '#6B7280', glow: GLOW_PRESETS.ember.light, speed: '#F07A0A' },
  neon: { bg: ['#0B0221', '#2A0B4A'], text: '#FFFFFF', sub: '#C4B5FD', glow: GLOW_PRESETS.violet.dark, speed: '#F0ABFC' },
  minimal: { bg: ['#F5F5F4', '#F5F5F4'], text: '#1C1917', sub: '#78716C', glow: { haze: '#1C1917', glow: '#1C1917', core: '#1C1917' }, speed: '#1C1917' },
};

export type CardFormat = 'post' | 'story';

export type ShareCardProps = {
  style: CardStyle;
  /** 4:5 for feeds, 9:16 for stories */
  format?: CardFormat;
  /** the car it was driven in, shown on the map */
  car?: { label: string; image: ImageSourcePropType } | null;
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  topSpeed: { value: string; unit: string };
  segments: LngLat[][];
  watermark: boolean;
};

export const W = 360;
export const SIZE: Record<CardFormat, { h: number; map: number }> = { post: { h: 450, map: 250 }, story: { h: 640, map: 400 } };
const PAD = 28;

/** Fits all segments into the map area, preserving shape (equirectangular). */
export function project(segments: LngLat[][], MAP_H: number): string[] {
  const all = segments.flat();
  if (all.length < 2) return [];
  const k = Math.cos((all.reduce((a, p) => a + p[1], 0) / all.length) * (Math.PI / 180));
  const xs = all.map((p) => p[0] * k);
  const ys = all.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - PAD * 2) / (maxX - minX || 1e-9), (MAP_H - PAD * 2) / (maxY - minY || 1e-9));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (MAP_H - (maxY - minY) * scale) / 2;
  return segments.map((seg) =>
    seg.map((p) => `${(ox + (p[0] * k - minX) * scale).toFixed(1)},${(oy + (maxY - p[1]) * scale).toFixed(1)}`).join(' ')
  );
}

/** Fixed-size card (360×450 post or 360×640 story). Phones capture it with react-native-view-shot; the web draws it with share-card-canvas. */
export const ShareCard = forwardRef<ComponentRef<typeof View>, ShareCardProps>(function ShareCard(
  { style, format = 'post', car, title, subtitle, stats, topSpeed, segments, watermark },
  ref
) {
  const look = LOOK[style];
  const { h: H, map: MAP_H } = SIZE[format];
  const lines = useMemo(() => project(segments, MAP_H), [segments, MAP_H]);
  const minimal = style === 'minimal';
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { height: H }]}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={look.bg[0]} />
            <Stop offset="1" stopColor={look.bg[1]} />
          </LinearGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#bg)" />
        {lines.map((pts, i) =>
          minimal ? (
            <Polyline key={i} points={pts} fill="none" stroke={look.glow.core} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            [
              <Polyline key={`h${i}`} points={pts} fill="none" stroke={look.glow.haze} strokeOpacity={0.3} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />,
              <Polyline key={`g${i}`} points={pts} fill="none" stroke={look.glow.glow} strokeOpacity={0.8} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />,
              <Polyline key={`c${i}`} points={pts} fill="none" stroke={look.glow.core} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />,
            ]
          )
        )}
      </Svg>
      {car ? <Image source={car.image} style={[styles.car, { top: MAP_H - 78 }]} resizeMode="contain" accessibilityLabel={car.label} /> : null}
      <View style={[styles.body, { top: MAP_H }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.title, { color: look.text }]} numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText style={{ color: look.sub, fontSize: 14 }} numberOfLines={1}>
              {subtitle}
            </ThemedText>
            {car ? (
              <ThemedText style={{ color: look.text, fontSize: 13, fontWeight: 700, opacity: 0.85 }} numberOfLines={1}>
                {car.label}
              </ThemedText>
            ) : null}
          </View>
          <View style={{ alignItems: 'center' }}>
            <ThemedText style={[styles.speed, { color: look.speed }]}>{topSpeed.value}</ThemedText>
            <ThemedText style={{ color: look.sub, fontSize: 11, fontWeight: 700 }}>TOP {topSpeed.unit}</ThemedText>
          </View>
        </View>
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={{ flex: 1 }}>
              <ThemedText style={{ color: look.text, fontSize: 20, fontWeight: 800 }}>{s.value}</ThemedText>
              <ThemedText style={{ color: look.sub, fontSize: 12 }}>{s.label}</ThemedText>
            </View>
          ))}
        </View>
        {watermark ? (
          <ThemedText style={[styles.watermark, { color: look.sub }]}>Tracked with Convoy</ThemedText>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: W, borderRadius: 24, overflow: 'hidden' },
  car: { position: 'absolute', right: 14, width: 132, height: 76 },
  body: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 8, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: 800 },
  speed: { fontSize: 34, lineHeight: 38, fontWeight: 800 },
  stats: { flexDirection: 'row' },
  watermark: { fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textAlign: 'right' },
});
