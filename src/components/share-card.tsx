import { forwardRef, useMemo, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';
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

const LOOK: Record<CardStyle, { bg: [string, string]; text: string; sub: string; glow: GlowPalette; speed: string }> = {
  night: { bg: ['#05070D', '#151A26'], text: '#FFFFFF', sub: '#A1A1AA', glow: GLOW_PRESETS.ember.dark, speed: '#FFA630' },
  day: { bg: ['#FFFFFF', '#EEF1F5'], text: '#0A0A0B', sub: '#6B7280', glow: GLOW_PRESETS.ember.light, speed: '#F07A0A' },
  neon: { bg: ['#0B0221', '#2A0B4A'], text: '#FFFFFF', sub: '#C4B5FD', glow: GLOW_PRESETS.violet.dark, speed: '#F0ABFC' },
  minimal: { bg: ['#F5F5F4', '#F5F5F4'], text: '#1C1917', sub: '#78716C', glow: { haze: '#1C1917', glow: '#1C1917', core: '#1C1917' }, speed: '#1C1917' },
};

export type ShareCardProps = {
  style: CardStyle;
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  topSpeed: { value: string; unit: string };
  segments: LngLat[][];
  watermark: boolean;
};

const W = 360;
const H = 450;
const MAP_H = 250;
const PAD = 28;

/** Fits all segments into the map area, preserving shape (equirectangular). */
function project(segments: LngLat[][]): string[] {
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

/** Fixed-size (360×450, 4:5) image for Instagram/stories; captured with react-native-view-shot. */
export const ShareCard = forwardRef<ComponentRef<typeof View>, ShareCardProps>(function ShareCard(
  { style, title, subtitle, stats, topSpeed, segments, watermark },
  ref
) {
  const look = LOOK[style];
  const lines = useMemo(() => project(segments), [segments]);
  const minimal = style === 'minimal';
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
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
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.title, { color: look.text }]} numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText style={{ color: look.sub, fontSize: 14 }} numberOfLines={1}>
              {subtitle}
            </ThemedText>
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
  card: { width: W, height: H, borderRadius: 24, overflow: 'hidden' },
  body: { position: 'absolute', left: 0, right: 0, top: MAP_H, bottom: 0, paddingHorizontal: 24, paddingTop: 8, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: 800 },
  speed: { fontSize: 34, lineHeight: 38, fontWeight: 800 },
  stats: { flexDirection: 'row' },
  watermark: { fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textAlign: 'right' },
});
