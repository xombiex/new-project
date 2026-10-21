// Live ETA page: /eta/<token>. Public, no account. Polls the share every few seconds and moves the
// driver's car along the map toward the destination, with the arrival time up top.
import { LngLatBounds, Map, Marker, setWorkerUrl } from '/vendor/maplibre-gl.mjs';

const SUPABASE_URL = 'https://qdcdveoidmnwqnabfuvd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hDaXcrVZbq3Dz3iPDDHZhA_xK13buHX'; // public key; the share is read through get_eta_share only
const POLL_MS = 5000;

setWorkerUrl('/maplibre-gl-worker.mjs');

const token = (location.pathname.split('/').filter(Boolean)[1] ?? new URLSearchParams(location.search).get('t') ?? '').replace(/[^a-f0-9]/gi, '');
const $ = (id) => document.getElementById(id);
const dark = matchMedia('(prefers-color-scheme: dark)').matches;

const map = new Map({
  container: 'map',
  style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`,
  center: [-98, 39],
  zoom: 3,
  attributionControl: { compact: true },
});

let car = null;
let pin = null;
let fitted = false;

function carElement(color) {
  const el = document.createElement('div');
  el.className = 'car';
  el.style.background = color || '#0a84ff';
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z"/></svg>';
  return el;
}

function pinElement() {
  const el = document.createElement('div');
  el.className = 'pin';
  return el;
}

const clock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}
function left(iso) {
  const min = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  if (min < 1) return 'arriving now';
  if (min < 60) return `${min} min away`;
  return `${Math.floor(min / 60)} hr ${min % 60} min away`;
}

async function load() {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_eta_share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) throw new Error(`ETA ${res.status}`);
  return res.json();
}

function render(s) {
  if (!s) {
    $('card').classList.add('hidden');
    $('gone').classList.remove('hidden');
    return false;
  }
  $('gone').classList.add('hidden');
  $('card').classList.remove('hidden');
  $('av').textContent = (s.name || '?')[0].toUpperCase();
  $('av').style.background = s.color || '#0a84ff';
  document.title = `${s.name}'s ETA · Convoy`;

  if (s.arrived) {
    $('headline').textContent = `${s.name} arrived at ${s.dest_name}`;
    $('eta').classList.add('done');
    $('eta-time').textContent = 'Arrived';
    $('eta-left').textContent = '';
    $('updated').textContent = `at ${clock(new Date(s.updated_at))}`;
  } else if (s.ended) {
    $('headline').textContent = `${s.name} stopped sharing`;
    $('eta-time').textContent = '–';
    $('eta-left').textContent = '';
    $('updated').textContent = `Last seen ${ago(s.updated_at)}`;
  } else {
    $('headline').textContent = `${s.name} is driving to ${s.dest_name}`;
    $('eta-time').textContent = s.eta_at ? clock(new Date(s.eta_at)) : '–';
    $('eta-left').textContent = s.eta_at ? left(s.eta_at) : '';
    $('updated').textContent = `Updated ${ago(s.updated_at)}`;
  }

  const dest = [s.dest_lng, s.dest_lat];
  if (!pin) pin = new Marker({ element: pinElement(), anchor: 'bottom' }).setLngLat(dest).addTo(map);
  if (s.lat != null && s.lng != null) {
    const here = [s.lng, s.lat];
    if (!car) car = new Marker({ element: carElement(s.color), rotationAlignment: 'map' }).setLngLat(here).addTo(map);
    else car.setLngLat(here);
    if (s.heading != null) car.setRotation(s.heading);
    if (!fitted) {
      fitted = true;
      const b = new LngLatBounds(here, here).extend(dest);
      map.fitBounds(b, { padding: { top: 190, bottom: 80, left: 50, right: 50 }, maxZoom: 15, duration: 0 });
    }
  } else if (!fitted) {
    fitted = true;
    map.jumpTo({ center: dest, zoom: 13 });
  }
  return !s.ended;
}

async function tick() {
  let live = true;
  try {
    live = render(await load());
  } catch {
    // network blip: try again next round
  }
  if (live) setTimeout(tick, POLL_MS);
}

// Markers and camera moves work before the style finishes loading, so don't wait for it.
tick();
