// Vercel build: Convoy web app at the root and static pages from web/ (terms, privacy, 404, logo).
// The admin portal is published only when ADMIN_PATH is set (a Vercel env var, never committed),
// at /<ADMIN_PATH>/. /admin itself is a 404.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
execSync('npx expo export --platform web', { stdio: 'inherit' });
cpSync('web', 'dist', { recursive: true });

// The live ETA page (/eta/<token>) loads the map library from here, same-origin (the CSP allows
// only our own scripts). The worker is already published at /maplibre-gl-worker.mjs.
mkdirSync('dist/vendor', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl.mjs', 'dist/vendor/maplibre-gl.mjs');
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl.css', 'dist/vendor/maplibre-gl.css');

// Installable on phones (Add to Home Screen): manifest, icon and full-screen hints.
const HEAD = [
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />',
  '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F2F3F5" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black" />',
  '<meta name="apple-mobile-web-app-title" content="Convoy" />',
  // Pin the app to the whole screen and paint behind it in the app's colors, so no strip of
  // white shows at the edges; stop the page itself from rubber-banding or zooming on double tap.
  `<style>
    html, body { background: #F2F3F5; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
    @media (prefers-color-scheme: dark) { html, body { background: #000; } }
    body { touch-action: manipulation; -webkit-text-size-adjust: 100%; }
    #root { position: fixed; inset: 0; height: auto; }
  </style>`,
].join('');
const indexHtml = readFileSync('dist/index.html', 'utf8')
  // Let the app draw under the notch; safe-area insets keep content clear of it.
  .replace('shrink-to-fit=no', 'shrink-to-fit=no, viewport-fit=cover')
  .replace('</head>', `${HEAD}</head>`);
writeFileSync('dist/index.html', indexHtml);

// Link previews (iMessage, Discord, WhatsApp...): every page gets a title, description and the
// Convoy card. Shared links (/add, /join, /eta) swap in their own through api/page.js.
const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://convoy-drab.vercel.app';
const PREVIEW_TITLE = 'Convoy · Drive together';
const PREVIEW_TEXT = 'Track every drive, ride with friends on one live map, build your 3D garage, and get speed limit and camera alerts. Free.';
for (const [file, path] of [['index.html', '/'], ['about.html', '/about'], ['privacy.html', '/privacy'], ['terms.html', '/terms'], ['eta.html', '/eta']]) {
  let html = readFileSync(`dist/${file}`, 'utf8');
  // Both are read out of the HTML already escaped. The app's own title is just "Convoy": say what it is.
  const own = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const title = own && own !== 'Convoy' ? own : PREVIEW_TITLE;
  const text = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || PREVIEW_TEXT;
  if (!/<meta name="description"/i.test(html)) html = html.replace('</head>', `<meta name="description" content="${text}" /></head>`);
  const tags = [
    ['og:type', 'website'], ['og:site_name', 'Convoy'], ['og:url', SITE + path], ['og:title', title], ['og:description', text],
    ['og:image', `${SITE}/api/og`], ['og:image:width', '1200'], ['og:image:height', '630'],
  ].map(([k, v]) => `<meta property="${k}" content="${v}" />`)
    .concat(['<meta name="twitter:card" content="summary_large_image" />', `<meta name="twitter:image" content="${SITE}/api/og" />`]);
  writeFileSync(`dist/${file}`, html.replace('</head>', `${tags.join('')}</head>`));
}

const slug = process.env.ADMIN_PATH?.trim();
if (slug) {
  if (!/^[a-z0-9-]{20,}$/.test(slug)) throw new Error('ADMIN_PATH must be 20+ chars of a-z, 0-9, -');
  const out = `dist/${slug}`;
  cpSync('admin', out, { recursive: true });
  copyFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', `${out}/supabase.js`);
  // Relative asset URLs need a base, since /<slug> may be requested without a trailing slash.
  const index = `${out}/index.html`;
  writeFileSync(index, readFileSync(index, 'utf8').replace('<head>', `<head>\n<base href="/${slug}/" />`));
  console.log('Admin portal published.');
} else {
  console.log('ADMIN_PATH not set: admin portal not published.');
}
