import { LOOK, project, SIZE, W, type ShareCardProps } from '@/components/share-card';

/**
 * Web export of the share card, drawn straight onto a canvas so the picture matches the card
 * exactly (DOM screenshot libraries mis-measure text). Returns a PNG data URI at `scale`× size.
 */
export async function drawShareCard(props: Omit<ShareCardProps, 'car'> & { car?: { label: string; uri: string } | null }, scale = 3): Promise<string> {
  const { style, format = 'post', car, title, subtitle, stats, topSpeed, segments, watermark } = props;
  const look = LOOK[style];
  const { h: H, map: MAP_H } = SIZE[format];
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const font = (weight: number, size: number) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const fit = (text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  };

  // Rounded card with the background gradient.
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 24);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, look.bg[0]);
  bg.addColorStop(1, look.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The route, glowing (haze, glow, core) unless the Minimal style.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const layers: [string, number, number][] =
    style === 'minimal' ? [[look.glow.core, 3, 1]] : [[look.glow.haze, 16, 0.3], [look.glow.glow, 7, 0.8], [look.glow.core, 2.5, 1]];
  for (const pts of project(segments, MAP_H)) {
    const xy = pts.split(' ').map((p) => p.split(',').map(Number));
    for (const [color, width, alpha] of layers) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (car?.uri) {
    const img = new Image();
    img.src = car.uri;
    await img.decode().catch(() => {});
    if (img.naturalWidth) {
      // Same box as the card's car (132×76, contain), anchored bottom-right of the map.
      const box = { x: W - 14 - 132, y: MAP_H - 78, w: 132, h: 76 };
      const k = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    }
  }

  // Title block on the left, top speed on the right.
  const left = 24;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = look.speed;
  ctx.font = font(800, 34);
  const speedX = W - 24 - 34;
  ctx.fillText(topSpeed.value, speedX, MAP_H + 44);
  ctx.fillStyle = look.sub;
  ctx.font = font(700, 11);
  ctx.fillText(`TOP ${topSpeed.unit}`, speedX, MAP_H + 60);

  ctx.textAlign = 'left';
  const textMax = speedX - 40 - left;
  ctx.fillStyle = look.text;
  ctx.font = font(800, 24);
  ctx.fillText(fit(title, textMax), left, MAP_H + 34);
  ctx.fillStyle = look.sub;
  ctx.font = font(400, 14);
  ctx.fillText(fit(subtitle, textMax), left, MAP_H + 54);
  let y = MAP_H + 54;
  if (car) {
    ctx.fillStyle = look.text;
    ctx.globalAlpha = 0.85;
    ctx.font = font(700, 13);
    ctx.fillText(fit(car.label, textMax), left, (y += 18));
    ctx.globalAlpha = 1;
  }

  // Stats row.
  const statsY = y + 40;
  const colW = (W - left * 2) / Math.max(1, stats.length);
  stats.forEach((s, i) => {
    const x = left + i * colW;
    ctx.fillStyle = look.text;
    ctx.font = font(800, 20);
    ctx.fillText(fit(s.value, colW - 6), x, statsY);
    ctx.fillStyle = look.sub;
    ctx.font = font(400, 12);
    ctx.fillText(fit(s.label, colW - 6), x, statsY + 17);
  });

  if (watermark) {
    ctx.textAlign = 'right';
    ctx.fillStyle = look.sub;
    ctx.font = font(700, 12);
    ctx.fillText('Tracked with Convoy', W - 24, statsY + 50);
  }

  return canvas.toDataURL('image/png');
}
