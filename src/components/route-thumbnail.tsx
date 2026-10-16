import { memo, useMemo } from 'react';
import Svg, { Polyline } from 'react-native-svg';

import type { LngLat } from '@/lib/geo';

type Props = { path: LngLat[]; width?: number; height?: number; color?: string; strokeWidth?: number };

/** Route outline scaled to fit a box, preserving shape (equirectangular, fine at trip scale). */
export const RouteThumbnail = memo(function RouteThumbnail({
  path,
  width = 64,
  height = 48,
  color = '#FFFFFF',
  strokeWidth = 2.5,
}: Props) {
  const points = useMemo(() => {
    if (path.length < 2) return '';
    const k = Math.cos((path.reduce((a, p) => a + p[1], 0) / path.length) * (Math.PI / 180));
    const xs = path.map((p) => p[0] * k);
    const ys = path.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = strokeWidth + 1;
    const scale = Math.min((width - pad * 2) / (maxX - minX || 1e-9), (height - pad * 2) / (maxY - minY || 1e-9));
    const ox = (width - (maxX - minX) * scale) / 2;
    const oy = (height - (maxY - minY) * scale) / 2;
    return xs.map((x, i) => `${(ox + (x - minX) * scale).toFixed(1)},${(oy + (maxY - ys[i]) * scale).toFixed(1)}`).join(' ');
  }, [path, width, height, strokeWidth]);

  return (
    <Svg width={width} height={height}>
      {points ? (
        <Polyline points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </Svg>
  );
});
