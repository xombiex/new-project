// The web map (maplibre-gl) loads its tile worker from a URL, which Metro can't bundle.
// Copy it into public/ so `npm run web` serves it same-origin, matching the installed version.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs';
if (existsSync(src)) {
  mkdirSync('public', { recursive: true });
  copyFileSync(src, 'public/maplibre-gl-worker.mjs');
}
