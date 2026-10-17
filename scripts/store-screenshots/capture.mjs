// App Store screenshots (6.7" iPhone, 1290×2796) from the real web app in demo mode.
//
//   npm run web                                  (dev server on :8091 — demo mode is dev-only)
//   node scripts/store-screenshots/capture.mjs   (uses the installed Microsoft Edge)
//
// Writes marketing/raw/<id>.png (the bare screen) and marketing/app-store/<n>-<id>.png (framed,
// with headline), and copies WebP versions to web/shots/ for the landing page.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const BASE = process.env.APP_URL ?? 'http://localhost:8091';
const EDGE = process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const VIEWPORT = { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export const SHOTS = [
  { id: 'track', path: '/trip/demo-trip?demo=trip', top: 'Every drive,', accent: 'tracked', sub: 'Speed, distance and a route colored by how fast you went', map: true },
  { id: 'together', path: '/?demo=drive', top: 'Drive', accent: 'together', sub: 'Your crew, live on one map, with their cars and speeds', map: true },
  { id: 'garage', path: '/garage?demo=garage', top: 'All your cars in one', accent: 'garage', sub: 'Pick a paint. Choose the one friends see you driving' },
  { id: 'themes', path: '/?demo=neon&theme=neon', top: 'Make the map', accent: 'yours', sub: 'Map themes, 3D buildings and camera alerts', map: true },
  { id: 'friends', path: '/friends?demo=friends', top: 'Compete with', accent: 'friends', sub: 'Weekly leaderboards. Distance counts, never speed', scroll: 540 },
  { id: 'blocks', path: '/?demo=blocks&theme=blocks', top: 'Blocky?', accent: 'Why not.', sub: 'Turn your city into a block world, sheep included', map: true },
];

function frameHtml(shot, png) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:430px;height:932px;overflow:hidden;background:#000;font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
  .bg{position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 0%,#14304d 0%,#06080c 55%,#000 100%)}
  .glow{position:absolute;left:50%;top:540px;width:520px;height:520px;margin-left:-260px;border-radius:50%;background:radial-gradient(circle,rgba(30,155,255,.28),transparent 65%)}
  h1{position:absolute;top:58px;left:0;right:0;margin:0;text-align:center;color:#fff;font-size:40px;line-height:44px;font-weight:900;letter-spacing:-.8px}
  h1 b{display:block;color:#FFA630;font-size:52px;line-height:58px}
  p{position:absolute;top:184px;left:40px;right:40px;margin:0;text-align:center;color:#AEB4BE;font-size:16px;line-height:22px;font-weight:600}
  .phone{position:absolute;left:50%;top:252px;width:330px;height:716px;margin-left:-175px;border:10px solid #1b1d22;border-radius:52px;overflow:hidden;
    box-shadow:0 0 0 2px #3a3d44,0 30px 80px rgba(0,0,0,.7)}
  .phone img{width:100%;height:100%;object-fit:cover;object-position:top}
  .island{position:absolute;left:50%;top:262px;width:96px;height:28px;margin-left:-48px;border-radius:20px;background:#000;z-index:2}
  </style></head><body><div class="bg"></div><div class="glow"></div>
  <h1>${shot.top}<b>${shot.accent}</b></h1><p>${shot.sub}</p>
  <div class="island"></div><div class="phone"><img src="data:image/png;base64,${png.toString('base64')}"></div></body></html>`;
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--no-first-run'],
});
mkdirSync(join(root, 'marketing/raw'), { recursive: true });
mkdirSync(join(root, 'marketing/app-store'), { recursive: true });
mkdirSync(join(root, 'web/shots'), { recursive: true });

const only = process.argv[2];
for (const [n, shot] of SHOTS.entries()) {
  if (only && shot.id !== only) continue;
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(BASE + shot.path, { waitUntil: 'networkidle2', timeout: 120_000 });
  // Give maps time to draw tiles, glide the car and fit routes; plain screens settle faster.
  await new Promise((r) => setTimeout(r, shot.map ? 14_000 : 5_000));
  if (shot.scroll) {
    // Scroll the screen's own list (React Native web renders ScrollViews as overflow divs).
    await page.evaluate((y) => {
      const scrollable = [...document.querySelectorAll('div')].filter((d) => ['auto', 'scroll'].includes(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 50);
      // The visible screen's list is the one with the most to scroll.
      scrollable.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
      scrollable[0]?.scrollTo({ top: y });
    }, shot.scroll);
    await new Promise((r) => setTimeout(r, 800));
  }
  const raw = await page.screenshot({ type: 'png' });
  writeFileSync(join(root, `marketing/raw/${shot.id}.png`), raw);
  await page.close();

  const framer = await browser.newPage();
  await framer.setViewport({ width: 430, height: 932, deviceScaleFactor: 3 });
  await framer.setContent(frameHtml(shot, Buffer.from(raw)), { waitUntil: 'load' });
  const framed = await framer.screenshot({ type: 'png' });
  writeFileSync(join(root, `marketing/app-store/${n + 1}-${shot.id}.png`), framed);
  // Landing page: just the phone (the page has its own headlines), WebP to stay light.
  const phone = await framer.$('.phone');
  const web = await phone.screenshot({ type: 'webp', quality: 82, omitBackground: true });
  writeFileSync(join(root, `web/shots/${shot.id}.webp`), web);
  await framer.close();
  console.log('captured', shot.id);
}
await browser.close();

