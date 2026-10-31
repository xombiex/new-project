// Turns a drive into a short vertical video: the route from above, a chase behind the 3D car, then
// the stats. Every frame is drawn and encoded in turn rather than recorded live, so a slow phone or a
// slow map tile makes the export take longer, never makes the video stutter.
import { GeoJSONSource, LngLat, LngLatBounds, Map as MLMap, type StyleSpecification } from 'maplibre-gl';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

import { bearing, type LngLat as Coord } from '@/lib/geo';
import { chaseZoom, turnBetween } from '@/lib/clip-route';
import type { GlowPalette } from '@/lib/glow';
import { buildTrack, positionAt } from '@/lib/replay';

import { buildingsLayer } from './buildings';
import { createCarsLayer, type Car3D } from './cars-3d.web';
import { lineFeature, lineLayers } from './line-style';

export type ClipInput = {
  /** The route to show, already trimmed and with privacy zones taken out. */
  segments: Coord[][];
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  topSpeed: { value: string; unit: string };
  vehicle?: string | null;
  paint?: string | null;
  flame?: string | null;
  trail?: string | null;
  style: string | StyleSpecification;
  glow: GlowPalette;
  dark: boolean;
  variant: 'blocks' | 'neon' | null;
  watermark: boolean;
};

export type ClipResult = { blob: Blob; mimeType: string; extension: 'mp4' };

export class ClipUnsupportedError extends Error {}

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const INTRO_S = 1.6;
const CHASE_S = 10;
const OUTRO_S = 2.6;
const FRAMES = Math.round((INTRO_S + CHASE_S + OUTRO_S) * FPS);
const CHASE_PITCH = 62;
/** Length of the car on screen in CSS pixels (the video is twice that): small over the whole route, then the star. */
const CAR_PIXELS_OVERVIEW = 44;
const CAR_PIXELS_CHASE = 150;
/** Give up waiting for map tiles on a frame after this long, so a dead connection can't hang the export. */
const TILE_WAIT_MS = 2500;
const MAP_LOAD_TIMEOUT_MS = 30_000;
/** How the car appears to be going, for its flames; the clip itself runs much faster than the drive. */
const SHOWN_SPEED_MPS = 22;

const CODECS: { codec: string; muxer: 'avc' | 'vp9' }[] = [
  { codec: 'avc1.640028', muxer: 'avc' },
  { codec: 'avc1.4d0028', muxer: 'avc' },
  { codec: 'avc1.420028', muxer: 'avc' },
  { codec: 'vp09.00.40.08', muxer: 'vp9' },
];

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pickCodec() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new ClipUnsupportedError('This browser can’t make videos. Try updating it, or use Chrome.');
  }
  for (const c of CODECS) {
    const config: VideoEncoderConfig = { codec: c.codec, width: WIDTH, height: HEIGHT, bitrate: 8_000_000, framerate: FPS };
    const { supported } = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (supported) return { config, muxer: c.muxer };
  }
  throw new ClipUnsupportedError('This device can’t encode video. Try updating your browser, or use Chrome.');
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const DISPLAY = '"BarlowCondensed_700Bold_Italic", "Arial Narrow", system-ui, sans-serif';
const TEXT = '"BarlowCondensed_600SemiBold", "Arial Narrow", system-ui, sans-serif';

/** Titles at the start, stats at the end, and the credit the map's license asks for. */
function drawOverlay(ctx: CanvasRenderingContext2D, input: ClipInput, seconds: number) {
  const introOut = 1 - smooth((seconds - INTRO_S + 0.2) / 0.6);
  const outroIn = smooth((seconds - INTRO_S - CHASE_S) / 0.7);

  const top = ctx.createLinearGradient(0, 0, 0, 520);
  top.addColorStop(0, `rgba(0,0,0,${0.72 * introOut})`);
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, WIDTH, 520);

  if (introOut > 0) {
    ctx.globalAlpha = introOut;
    ctx.fillStyle = '#ffffff';
    ctx.font = `104px ${DISPLAY}`;
    ctx.fillText(input.title, 72, 210, WIDTH - 144);
    ctx.font = `46px ${TEXT}`;
    ctx.fillStyle = '#ff7a1a';
    ctx.fillText(input.subtitle.toUpperCase(), 72, 280, WIDTH - 144);
    ctx.globalAlpha = 1;
  }

  if (outroIn > 0) {
    ctx.globalAlpha = outroIn;
    const shade = ctx.createLinearGradient(0, HEIGHT * 0.3, 0, HEIGHT);
    shade.addColorStop(0, 'rgba(8,8,8,0)');
    shade.addColorStop(0.45, 'rgba(8,8,8,0.92)');
    shade.addColorStop(1, 'rgba(8,8,8,0.98)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, HEIGHT * 0.3, WIDTH, HEIGHT * 0.7);

    ctx.fillStyle = '#ff7a1a';
    ctx.font = `44px ${TEXT}`;
    ctx.fillText('TOP SPEED', 72, 1060);
    ctx.fillStyle = '#ffffff';
    ctx.font = `260px ${DISPLAY}`;
    ctx.fillText(input.topSpeed.value, 64, 1290);
    const width = ctx.measureText(input.topSpeed.value).width;
    ctx.font = `64px ${DISPLAY}`;
    ctx.fillText(input.topSpeed.unit, 64 + width + 24, 1290);

    const columns = Math.max(1, input.stats.length);
    input.stats.forEach((s, i) => {
      const x = 72 + i * ((WIDTH - 144) / columns);
      ctx.fillStyle = '#ffffff';
      ctx.font = `84px ${DISPLAY}`;
      ctx.fillText(s.value, x, 1470, (WIDTH - 144) / columns - 16);
      ctx.fillStyle = '#a8a29a';
      ctx.font = `38px ${TEXT}`;
      ctx.fillText(s.label.toUpperCase(), x, 1524, (WIDTH - 144) / columns - 16);
    });
    ctx.globalAlpha = 1;
  }

  if (input.watermark) {
    ctx.font = `44px ${DISPLAY}`;
    const label = 'Tracked with Convoy';
    const w = ctx.measureText(label).width + 56;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, (WIDTH - w) / 2, HEIGHT - 228, w, 76, 38);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, WIDTH / 2, HEIGHT - 174);
    ctx.textAlign = 'left';
  }

  ctx.font = `26px ${TEXT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'center';
  ctx.fillText('© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap', WIDTH / 2, HEIGHT - 72);
  ctx.textAlign = 'left';
}

export async function generateClip(input: ClipInput, onProgress: (fraction: number) => void): Promise<ClipResult> {
  const { config, muxer: muxerCodec } = await pickCodec();
  const pieces = input.segments.filter((s) => s.length > 1);
  const flat = pieces.flat();
  if (flat.length < 2) throw new Error('This drive is too short for a clip.');
  const track = buildTrack(flat);

  // Where each piece starts along the whole route, so a gap for a privacy zone stays a gap.
  const starts: number[] = [];
  let count = 0;
  for (const p of pieces) {
    starts.push(count);
    count += p.length;
  }
  const drawnSoFar = (points: Coord[]): Coord[][] => {
    const out: Coord[][] = [];
    starts.forEach((s, i) => {
      if (s >= points.length - 1) return;
      out.push(points.slice(s, i + 1 < starts.length ? Math.min(starts[i + 1], points.length) : points.length));
    });
    if (out.length) out[out.length - 1] = [...out[out.length - 1], points[points.length - 1]];
    return out;
  };

  const host = document.createElement('div');
  // Full size but off screen: a map with no size won't draw.
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: `${WIDTH / 2}px`, height: `${HEIGHT / 2}px`, pointerEvents: 'none' });
  document.body.appendChild(host);

  const bounds = flat.reduce((b, p) => b.extend(p), new LngLatBounds(flat[0], flat[0]));
  const map = new MLMap({
    container: host,
    style: input.style,
    bounds,
    fitBoundsOptions: { padding: 80 },
    pixelRatio: 2,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
  });

  const encoderErrors: Error[] = [];
  let encoder: VideoEncoder | null = null;
  try {
    // Frames are drawn by hand from here on: a page in the background may never get one by itself.
    await new Promise<void>((resolve, reject) => {
      const ticker = setInterval(() => map.redraw(), 50);
      const giveUp = setTimeout(() => finish(new Error('The map took too long to load. Check your connection and try again.')), MAP_LOAD_TIMEOUT_MS);
      const finish = (e?: Error) => {
        clearInterval(ticker);
        clearTimeout(giveUp);
        if (e) reject(e);
        else resolve();
      };
      // Not 'load', which waits for every tile of the first view: each frame below waits for its own.
      map.once('style.load', () => finish());
      // A single missing tile is fine; only a map style that won't load stops the clip.
      map.on('error', (e) => {
        if (!map.isStyleLoaded()) finish(new Error(e.error?.message ?? 'Could not load the map'));
      });
    });

    const overview = map.cameraForBounds(bounds, { padding: { top: 340, bottom: 300, left: 70, right: 70 } });
    const overviewZoom = overview?.zoom ?? map.getZoom();
    const start = LngLat.convert(overview?.center ?? map.getCenter());

    map.addLayer(buildingsLayer(input.dark, input.variant) as never);
    map.setLayoutProperty('convoy-buildings-3d', 'visibility', 'visible');

    const line = { id: 'clip', coords: [] as Coord[][], color: input.glow.glow, width: 7, variant: 'glow' as const };
    map.addSource('clip', { type: 'geojson', data: lineFeature({ ...line, coords: [[flat[0], flat[0]]] }) });
    for (const l of lineLayers(line, input.glow)) {
      map.addLayer({ id: `clip-${l.suffix}`, type: 'line', source: 'clip', layout: l.layout as never, paint: l.paint as never });
    }

    let clockMs = 0;
    let carPixels = CAR_PIXELS_OVERVIEW;
    let car: Car3D = { id: 'me', coord: flat[0], heading: 0, vehicle: input.vehicle, paint: input.paint, flame: input.flame, trail: input.trail, exact: true };
    const carsReady = new Promise<void>((resolve) => {
      map.addLayer(createCarsLayer(() => [car], resolve, { now: () => clockMs, manualFrames: true, carPixels: () => carPixels }));
    });
    // A model that won't load shouldn't stop the clip; it just has no car.
    const models = Promise.race([carsReady, wait(15_000)]);
    while ((await Promise.race([models.then(() => 'done'), wait(50).then(() => 'tick')])) === 'tick') map.redraw();

    const zoom = chaseZoom(track.total, CHASE_S, flat[0][1]);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: muxerCodec, width: WIDTH, height: HEIGHT, frameRate: FPS }, fastStart: 'in-memory' });
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => encoderErrors.push(e),
    });
    encoder.configure(config);

    // Look ahead along the road so the camera turns before the car does, without the GPS jitter.
    const facing = (f: number) => {
      const a = positionAt(track, f).head;
      const b = positionAt(track, Math.min(1, f + 0.015)).head;
      return a[0] === b[0] && a[1] === b[1] ? null : bearing(a, b);
    };
    let cameraBearing = facing(0) ?? 0;
    let carHeading = cameraBearing;

    for (let i = 0; i < FRAMES; i++) {
      const seconds = i / FPS;
      clockMs = seconds * 1000;
      const chase = (seconds - INTRO_S) / CHASE_S;
      const f = smooth(chase) * 0.35 + Math.max(0, Math.min(1, chase)) * 0.65;
      const { head, heading, drawn } = positionAt(track, f);

      const wanted = facing(f) ?? cameraBearing;
      cameraBearing += turnBetween(cameraBearing, wanted) * 0.06;
      carHeading += turnBetween(carHeading, heading) * 0.35;

      const toChase = smooth((seconds - 0.5) / (INTRO_S - 0.3));
      const toOverview = smooth((seconds - INTRO_S - CHASE_S + 0.1) / 1.1);
      const near = toChase * (1 - toOverview);
      carPixels = lerp(CAR_PIXELS_OVERVIEW, CAR_PIXELS_CHASE, near);

      map.jumpTo({
        center: [lerp(start.lng, head[0], near), lerp(start.lat, head[1], near)],
        zoom: lerp(overviewZoom, zoom, near),
        pitch: CHASE_PITCH * near,
        bearing: cameraBearing * near,
      });
      car = { ...car, coord: head, heading: carHeading, speedMps: chase > 0 && chase < 1 ? SHOWN_SPEED_MPS : 0 };
      (map.getSource('clip') as GeoJSONSource).setData(lineFeature({ ...line, coords: drawnSoFar(drawn) }));

      // Wait until this frame's tiles and line are in, then draw it.
      const deadline = performance.now() + TILE_WAIT_MS;
      map.redraw();
      while ((!map.isSourceLoaded('clip') || !map.areTilesLoaded()) && performance.now() < deadline) {
        await wait(16);
        map.redraw();
      }
      map.redraw();

      ctx.drawImage(map.getCanvas(), 0, 0, WIDTH, HEIGHT);
      drawOverlay(ctx, input, seconds);

      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      if (encoderErrors.length) throw encoderErrors[0];
      while (encoder.encodeQueueSize > 4) await wait(4);
      onProgress((i + 1) / FRAMES);
      if (i % 5 === 0) await wait(0); // let the page breathe
    }

    await encoder.flush();
    if (encoderErrors.length) throw encoderErrors[0];
    muxer.finalize();
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), mimeType: 'video/mp4', extension: 'mp4' };
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
    map.remove();
    host.remove();
  }
}
