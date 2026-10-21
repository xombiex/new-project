// What a shared Convoy link says about itself, for link previews ("embeds") in iMessage, Discord,
// WhatsApp, Slack, X and friends. Shared by /api/page (the tags) and /api/og (the picture).
// Not a route itself: Vercel skips files in api/ that start with an underscore.

const SUPABASE_URL = 'https://qdcdveoidmnwqnabfuvd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hDaXcrVZbq3Dz3iPDDHZhA_xK13buHX'; // public key; only the anon preview functions are called

export const ACCENT = '#1E9BFF';
export const DEFAULT = {
  title: 'Convoy · Drive together',
  description: 'Track every drive, ride with friends on one live map, build your 3D garage, and get speed limit and camera alerts. Free.',
};

async function rpc(fn, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(body),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const clean = (s, max = 80) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const color = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : ACCENT);

function minutesLeft(iso) {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (!Number.isFinite(min)) return null;
  if (min < 1) return 'arriving now';
  if (min < 60) return `about ${min} min away`;
  return `about ${Math.floor(min / 60)} hr ${min % 60} min away`;
}

/**
 * The preview for one link. `kind` is user | join | eta, `key` is the username / code / token.
 * Always returns something: a link that has ended or never existed gets a plain Convoy card.
 * `card` is what the picture shows: a badge line, a big title, a line under it and an accent color.
 */
export async function describe(kind, key) {
  key = String(key ?? '');
  if (kind === 'user' && /^[a-z0-9_.]{2,30}$/i.test(key)) {
    const p = await rpc('link_preview', { p_kind: 'user', p_key: key });
    if (p) {
      const name = clean(p.name, 40);
      const car = clean(p.nickname ? `${p.nickname} · ${p.car ?? ''}`.replace(/ · $/, '') : p.car, 60);
      return {
        title: `Add ${name} on Convoy`,
        description: `${car ? `@${p.username} drives a ${car}. ` : ''}Add ${name} as a friend on Convoy to see each other on the map and drive together.`,
        card: {
          badge: 'FRIEND INVITE',
          title: name,
          line: car ? `@${p.username} · ${car}` : `@${p.username}`,
          foot: 'Tap to add them on Convoy',
          color: color(p.color),
          initial: name[0]?.toUpperCase() ?? '?',
          vehicle: /^[a-z]+$/.test(p.vehicle ?? '') && /^[a-z]+$/.test(p.vehicle_color ?? '') ? `${p.vehicle}-${p.vehicle_color}` : 'car-blue',
        },
      };
    }
  }

  if (kind === 'join' && /^[a-z0-9]{6}$/i.test(key)) {
    const d = await rpc('link_preview', { p_kind: 'drive', p_key: key });
    if (d) {
      const name = clean(d.name, 50);
      const dest = clean(d.destination, 60);
      const people = plural(Number(d.members) || 0, 'driver', 'drivers');
      return {
        title: `Join "${name}" on Convoy`,
        description: `${clean(d.host, 30) || 'A friend'} started a group drive${dest ? ` to ${dest}` : ''}. ${people} so far: see everyone on one live map.`,
        card: {
          badge: 'GROUP DRIVE',
          title: name,
          line: dest ? `Heading to ${dest}` : `Hosted by ${clean(d.host, 30)}`,
          foot: `${people} · code ${key.toUpperCase()}`,
          color: color(d.color),
          initial: clean(d.host, 30)[0]?.toUpperCase() ?? '?',
        },
      };
    }
  }

  if (kind === 'join' && /^[a-z0-9]{8}$/i.test(key)) {
    const c = await rpc('link_preview', { p_kind: 'club', p_key: key });
    if (c) {
      const name = clean(c.name, 50);
      const members = plural(Number(c.members) || 0, 'member', 'members');
      return {
        title: `Join ${name} on Convoy`,
        description: clean(c.description, 160) || `${members}. Club drives, events and a live map for the whole crew.`,
        card: {
          badge: 'CLUB INVITE',
          title: name,
          line: clean(c.description, 90) || 'Club drives, events and one live map',
          foot: members,
          color: color(c.color),
          initial: name[0]?.toUpperCase() ?? '?',
        },
      };
    }
  }

  if (kind === 'eta' && /^[a-f0-9]{24}$/i.test(key)) {
    const s = await rpc('get_eta_share', { p_token: key });
    if (s) {
      const name = clean(s.name, 30) || 'Your friend';
      const dest = clean(s.dest_name, 60);
      const status = s.arrived ? 'Arrived' : s.ended ? 'Stopped sharing' : (s.eta_at && minutesLeft(s.eta_at)) || 'On the way';
      return {
        title: s.arrived ? `${name} arrived at ${dest}` : `${name} is driving to ${dest}`,
        description: s.ended ? `${name}'s live ETA has ended.` : `Follow along live: ${status}. Updates until ${name} gets there.`,
        card: {
          badge: s.ended ? 'LIVE ETA · ENDED' : 'LIVE ETA',
          title: dest,
          line: s.arrived ? `${name} arrived` : `${name} is on the way`,
          foot: status[0].toUpperCase() + status.slice(1),
          color: color(s.color),
          initial: name[0].toUpperCase(),
          live: !s.ended,
        },
      };
    }
  }

  return { ...DEFAULT, card: null };
}
