// The picture in a link preview: GET /api/og?kind=user|join|eta&key=… → a 1200×630 PNG card.
// No kind (or a link that has ended) gives the plain Convoy card used across the site.
import { ImageResponse } from '@vercel/og';

import { ACCENT, DEFAULT, describe } from './_preview.mjs';

// Node, not edge: the edge runtime won't compile the image renderer's WebAssembly.

const W = 1200;
const H = 630;
const BG = '#0B0C0F';
const MUTED = '#A1A1AA';

/** A satori element: h('div', { ...style }, ...children). */
const h = (type, style, ...children) => {
  const kids = children.flat().filter((c) => c !== null && c !== false);
  // Satori counts an array as several children, even of one: text for line clamping must be bare.
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
};
const img = (src, style) => ({ type: 'img', props: { src, style } });
/** '#RRGGBB' with an alpha, for glows and tints. */
const tint = (hex, alpha) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(alpha * 255).toString(16).padStart(2, '0') : hex);

async function asset(origin, path) {
  const res = await fetch(new URL(path, origin));
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

function dataUrl(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

function brand(icon) {
  return h(
    'div',
    { alignItems: 'center', gap: 18 },
    img(icon, { width: 64, height: 64, borderRadius: 16 }),
    h('div', { fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }, 'Convoy'),
  );
}

function linkCard(card, icon, vehicle) {
  const color = card.color || ACCENT;
  return h(
    'div',
    { width: W, height: H, flexDirection: 'column', justifyContent: 'space-between', padding: '56px 64px', backgroundColor: BG, color: '#fff', fontFamily: 'Inter',
      backgroundImage: `linear-gradient(120deg, ${BG} 0%, ${BG} 38%, ${tint(color, 0.16)} 70%, ${tint(color, 0.42)} 100%)` },
    // Top: the app, and what kind of link this is
    h(
      'div',
      { justifyContent: 'space-between', alignItems: 'center' },
      brand(icon),
      h(
        'div',
        { alignItems: 'center', gap: 12, padding: '12px 24px', borderRadius: 999, backgroundColor: tint(color, 0.18), border: `2px solid ${tint(color, 0.5)}`, fontSize: 24, fontWeight: 700, letterSpacing: 2 },
        card.live ? h('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: '#30D158' }) : null,
        card.badge,
      ),
    ),
    // Middle: who or what, big
    h(
      'div',
      { alignItems: 'center', gap: 40 },
      h(
        'div',
        { width: 148, height: 148, borderRadius: 74, backgroundColor: color, alignItems: 'center', justifyContent: 'center', fontSize: 72, fontWeight: 700, color: '#fff', border: '6px solid rgba(255,255,255,0.9)', flexShrink: 0 },
        card.initial,
      ),
      h(
        'div',
        { flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 },
        h('div', { fontSize: card.title.length > 28 ? 60 : 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5, lineClamp: 2, display: 'block' }, card.title),
        h('div', { fontSize: 34, fontWeight: 600, color: MUTED, lineClamp: 1, display: 'block' }, card.line),
      ),
      vehicle ? img(vehicle, { width: 240, height: 240, transform: 'rotate(90deg)', flexShrink: 0 }) : null,
    ),
    // Bottom: the detail line, on an accent rule
    h(
      'div',
      { alignItems: 'center', gap: 20 },
      h('div', { width: 8, height: 44, borderRadius: 4, backgroundColor: color }),
      h('div', { fontSize: 34, fontWeight: 600, color: '#fff' }, card.foot),
    ),
  );
}

function defaultCard(icon) {
  return h(
    'div',
    { width: W, height: H, flexDirection: 'column', justifyContent: 'center', padding: '0 96px', gap: 28, backgroundColor: BG, color: '#fff', fontFamily: 'Inter',
      backgroundImage: `linear-gradient(120deg, ${BG} 0%, ${BG} 38%, ${tint(ACCENT, 0.16)} 70%, ${tint(ACCENT, 0.45)} 100%)` },
    img(icon, { width: 132, height: 132, borderRadius: 32 }),
    h('div', { fontSize: 96, fontWeight: 700, letterSpacing: -2.5 }, 'Drive together.'),
    h('div', { fontSize: 36, fontWeight: 600, color: MUTED, lineHeight: 1.35, maxWidth: 900, display: 'block' }, DEFAULT.description),
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const info = kind ? await describe(kind, url.searchParams.get('key')) : { card: null };
  const vehicleName = info.card?.vehicle;

  const [bold, semibold, iconBytes, vehicleBytes] = await Promise.all([
    asset(url.origin, '/fonts/inter-bold.ttf'),
    asset(url.origin, '/fonts/inter-semibold.ttf'),
    asset(url.origin, '/icon-512.png'),
    vehicleName ? asset(url.origin, `/vehicles/${vehicleName}.png`) : null,
  ]);
  const icon = dataUrl(iconBytes);
  const vehicle = vehicleBytes ? dataUrl(vehicleBytes) : null;

  // Render it all here rather than streaming: a failed render must not reach a cache as an empty
  // 200, and ImageResponse's own one-year "immutable" header is wrong for live ETAs.
  try {
    const png = await new ImageResponse(info.card ? linkCard(info.card, icon, vehicle) : defaultCard(icon), {
      width: W,
      height: H,
      emoji: 'twemoji',
      fonts: [
        { name: 'Inter', data: bold.buffer, weight: 700, style: 'normal' },
        { name: 'Inter', data: semibold.buffer, weight: 600, style: 'normal' },
      ],
    }).arrayBuffer();
    if (!png.byteLength) throw new Error('empty render');
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': kind === 'eta' ? 'public, max-age=60, s-maxage=60' : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('og render failed', err);
    return new Response('Preview unavailable', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
