// Shared links with a preview: /add/<username>, /join/<code> and /eta/<token> are rewritten here
// (vercel.json). It serves the same page as before (the web app, or the live ETA page) with the
// title, description and picture for that link written into <head>, since chat apps read the HTML
// and never run the page's scripts.
import { describe } from './_preview.js';

export const config = { runtime: 'edge' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default async function handler(request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const key = url.searchParams.get('key') ?? '';
  const path = kind === 'user' ? `/add/${key}` : kind === 'join' ? `/join/${key}` : `/eta/${key}`;

  const [base, info] = await Promise.all([
    fetch(new URL(kind === 'eta' ? '/eta' : '/', url.origin)).then((r) => r.text()),
    describe(kind, key),
  ]);

  // Chat apps keep a picture by its URL: give a live ETA a fresh one every few minutes.
  const fresh = kind === 'eta' ? `&v=${Math.floor(Date.now() / 300000).toString(36)}` : '';
  const image = `${url.origin}/api/og?kind=${encodeURIComponent(kind ?? '')}&key=${encodeURIComponent(key)}${fresh}`;
  const tags = [
    `<title>${esc(info.title)}</title>`,
    `<meta name="description" content="${esc(info.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Convoy" />`,
    `<meta property="og:url" content="${esc(url.origin + path)}" />`,
    `<meta property="og:title" content="${esc(info.title)}" />`,
    `<meta property="og:description" content="${esc(info.description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(info.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(info.title)}" />`,
    `<meta name="twitter:description" content="${esc(info.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="theme-color" content="${esc(info.card?.color ?? '#1E9BFF')}" />`,
  ].join('\n');

  const html = base
    // Drop the page's generic tags; this link's own go in their place.
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta (?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/gi, '')
    .replace('</head>', `${tags}\n</head>`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Live ETAs change by the minute; invites hardly at all.
      'Cache-Control': kind === 'eta' ? 'public, max-age=0, s-maxage=60' : 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
    },
  });
}
