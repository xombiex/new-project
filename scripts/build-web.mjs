// Vercel build: Convoy web app at the root and static pages from web/ (terms, privacy, 404, logo).
// The admin portal is published only when ADMIN_PATH is set (a Vercel env var, never committed),
// at /<ADMIN_PATH>/. /admin itself is a 404.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
execSync('npx expo export --platform web', { stdio: 'inherit' });
cpSync('web', 'dist', { recursive: true });

// Installable on phones (Add to Home Screen): manifest, icon and full-screen hints.
const HEAD = [
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<meta name="theme-color" content="#000000" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Convoy" />',
].join('');
const indexHtml = readFileSync('dist/index.html', 'utf8')
  // Let the app draw under the notch; safe-area insets keep content clear of it.
  .replace('shrink-to-fit=no', 'shrink-to-fit=no, viewport-fit=cover')
  .replace('</head>', `${HEAD}</head>`);
writeFileSync('dist/index.html', indexHtml);

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
