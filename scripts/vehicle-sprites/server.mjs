// Dev tool: renders the 3D map vehicle sprites (assets/vehicles/*.png) in a browser.
//   node scripts/vehicle-sprites/server.mjs  →  open http://localhost:8093 and wait for "done"
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../assets/vehicles');
const web = join(here, '../../public/vehicles');

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(readFileSync(join(here, 'index.html')));
    return;
  }
  // Kenney's Car Kit (CC0), the source models for some of the sprites.
  if (req.method === 'GET' && url.pathname.startsWith('/kenney/') && !url.pathname.includes('..')) {
    const file = join(here, url.pathname);
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : 'model/gltf-binary' }).end(readFileSync(file));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/save-model') {
    const name = url.searchParams.get('name') ?? '';
    if (!/^[a-z]+\.(glb|json|png)$/.test(name)) return res.writeHead(400).end('bad name');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      // Kenney's models look for their shared palette in Textures/.
      const dir = join(here, '../../public/models', name === 'colormap.png' ? 'Textures' : '');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), Buffer.concat(chunks));
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = url.searchParams.get('name') ?? '';
    if (!/^(side-)?[a-z]+-[a-z]+(@[23]x)?\.(png|webp)$/.test(name)) return res.writeHead(400).end('bad name');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      writeFileSync(join(out, name), Buffer.concat(chunks));
      // The web map loads the @3x render from public/vehicles/<name>.png.
      if (name.endsWith('@3x.png')) writeFileSync(join(web, name.replace('@3x', '')), Buffer.concat(chunks));
      // Garage showroom shots: the web loads the same file from public/vehicles.
      if (name.startsWith('side-')) writeFileSync(join(web, name.replace('@2x', '')), Buffer.concat(chunks));
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(404).end();
}).listen(8093, '127.0.0.1', () => console.log('vehicle sprite renderer on http://localhost:8093'));
