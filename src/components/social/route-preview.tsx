import { memo, useMemo, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LngLat } from '@/lib/geo';

/**
 * The shape of a shared drive, drawn like a road on a paper map: a pale casing with the route on
 * top. It fills its width. The ends are not marked, because the real start and finish were cut
 * off before sharing.
 */
export const RoutePreview = memo(function RoutePreview({ segments, height = 150 }: { segments: LngLat[][]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const lines = useMemo(() => {
    const all = segments.flat();
    if (all.length < 2 || width === 0) return [];
    const k = Math.cos((all.reduce((a, p) => a + p[1], 0) / all.length) * (Math.PI / 180));
    const xs = all.map((p) => p[0] * k);
    const ys = all.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 18;
    const scale = Math.min((width - pad * 2) / (maxX - minX || 1e-9), (height - pad * 2) / (maxY - minY || 1e-9));
    const ox = (width - (maxX - minX) * scale) / 2;
    const oy = (height - (maxY - minY) * scale) / 2;
    return segments.map((s) => s.map((p) => `${(ox + (p[0] * k - minX) * scale).toFixed(1)},${(oy + (maxY - p[1]) * scale).toFixed(1)}`).join(' '));
  }, [segments, width, height]);

  return (
    <View onLayout={onLayout} style={{ height, borderRadius: Radius.md, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }} accessibilityRole="image" accessibilityLabel="The shape of the route">
      {lines.length ? (
        <Svg width={width} height={height}>
          {lines.map((points, i) => (
            <Polyline key={`c${i}`} points={points} fill="none" stroke={theme.background} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {lines.map((points, i) => (
            <Polyline key={`r${i}`} points={points} fill="none" stroke={theme.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      ) : null}
    </View>
  );
});
