// Sends push notifications through Expo's push service.
//
// The app never pushes to other users directly: it asks this function, which checks the
// request is legitimate (e.g. you can only invite *your friends* to a drive *you're in*),
// respects each recipient's notification settings, dedupes, and rate-limits senders.
//
// Optional secret: EXPO_ACCESS_TOKEN (if "enhanced push security" is on in Expo).
// Club event reminders come from a pg_cron job that sends a vault-stored secret header.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const EXPO_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');

type Pref = 'friend_requests' | 'drive_invites' | 'drive_activity' | 'club_events' | 'announcements';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from the request body are interpolated into filters below, so only accept real UUIDs. */
function uuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, 'invalid id');
  return v;
}

async function displayName(id: string) {
  const { data } = await admin.from('profiles').select('display_name').eq('id', id).maybeSingle();
  return data?.display_name ?? 'Someone';
}

async function areFriends(a: string, b: string) {
  const { count } = await admin
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`);
  return (count ?? 0) > 0;
}

async function activeDriveFor(member: string, driveId: string) {
  const { data: m } = await admin.from('group_members').select('drive_id').eq('drive_id', driveId).eq('user_id', member).maybeSingle();
  if (!m) throw new HttpError(403, 'not a member of this drive');
  const { data: drive } = await admin.from('group_drives').select('id, name, code, status').eq('id', driveId).single();
  if (!drive || drive.status !== 'active') throw new HttpError(404, 'drive not active');
  return drive;
}

/** Split big id lists so `.in()` filters stay well under URL limits (broadcasts can be thousands). */
function chunks<T>(xs: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** `pref` null = always deliver (a message from the Convoy team to just you). */
async function send(sender: string | null, recipients: string[], type: string, pref: Pref | null, title: string, body: string, data: Record<string, unknown>) {
  let targets = [...new Set(recipients)].filter((r) => r !== sender);
  if (targets.length === 0) return 0;

  if (sender) {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin.from('notification_log').select('*', { count: 'exact', head: true }).eq('sender', sender).gte('created_at', hourAgo);
    if ((count ?? 0) >= 100) throw new HttpError(429, 'too many notifications');
    // Same sender → same person → same type within a minute is a duplicate.
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin.from('notification_log').select('recipient').eq('sender', sender).eq('type', type).gte('created_at', minuteAgo).in('recipient', targets);
    const dup = new Set((recent ?? []).map((r) => r.recipient));
    targets = targets.filter((t) => !dup.has(t));
  }

  // Missing settings row = defaults (everything on).
  if (pref) {
    const off = new Set<string>();
    for (const part of chunks(targets)) {
      const { data: settings } = await admin.from('notification_settings').select(`user_id, ${pref}`).in('user_id', part);
      for (const s of (settings ?? []) as Record<string, unknown>[]) if (s[pref] === false) off.add(s.user_id as string);
    }
    targets = targets.filter((t) => !off.has(t));
  }
  if (targets.length === 0) return 0;

  const tokens: { token: string }[] = [];
  for (const part of chunks(targets)) {
    const { data: rows } = await admin.from('push_tokens').select('token').in('user_id', part);
    tokens.push(...(rows ?? []));
  }
  const messages = tokens.map((t) => ({ to: t.token, title, body, data: { ...data, type }, sound: 'default' }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(EXPO_TOKEN ? { Authorization: `Bearer ${EXPO_TOKEN}` } : {}) },
      body: JSON.stringify(chunk),
    });
    const result = await res.json().catch(() => null);
    // Forget tokens for uninstalled apps.
    const dead = (result?.data ?? [])
      .map((ticket: { status: string; details?: { error?: string } }, j: number) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? chunk[j].to : null)
      .filter(Boolean);
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  }

  for (const part of chunks(targets, 1000)) await admin.from('notification_log').insert(part.map((recipient) => ({ sender, recipient, type })));
  return targets.length;
}

/** Reminders for club events starting in the next hour (called by the scheduled job). */
async function eventReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 60_000);
  const { data: events } = await admin
    .from('club_events')
    .select('id, title, starts_at, club_id, clubs(name)')
    .gte('starts_at', now.toISOString())
    .lt('starts_at', soon.toISOString())
    .is('reminder_sent_at', null);
  let sent = 0;
  for (const ev of events ?? []) {
    const { data: rsvps } = await admin.from('event_rsvps').select('user_id').eq('event_id', ev.id).eq('status', 'going');
    const club = (ev as unknown as { clubs: { name: string } | null }).clubs?.name ?? 'Your club';
    const mins = Math.max(1, Math.round((Date.parse(ev.starts_at) - now.getTime()) / 60_000));
    sent += await send(null, (rsvps ?? []).map((r) => r.user_id), 'event_reminder', 'club_events', club, `${ev.title} starts in ${mins} min`, { event_id: ev.id });
    await admin.from('club_events').update({ reminder_sent_at: now.toISOString() }).eq('id', ev.id);
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const { data: ok } = await admin.rpc('cron_secret_ok', { p: cronSecret });
      if (!ok) return json({ error: 'unauthorized' }, 401);
      return json({ sent: await eventReminders() });
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(jwt);
    const me = auth?.user?.id;
    if (!me) return json({ error: 'unauthorized' }, 401);

    const body = await req.json();
    const name = body.type === 'admin_message' ? '' : await displayName(me);
    let sent = 0;

    switch (body.type) {
      case 'friend_request': {
        const { count } = await admin.from('friendships').select('*', { count: 'exact', head: true }).eq('requester_id', me).eq('addressee_id', uuid(body.to)).eq('status', 'pending');
        if (!count) throw new HttpError(403, 'no pending request');
        sent = await send(me, [uuid(body.to)], 'friend_request', 'friend_requests', 'Friend request', `${name} wants to add you on Convoy`, {});
        break;
      }
      case 'friend_accepted': {
        const { count } = await admin.from('friendships').select('*', { count: 'exact', head: true }).eq('requester_id', uuid(body.to)).eq('addressee_id', me).eq('status', 'accepted');
        if (!count) throw new HttpError(403, 'not accepted');
        sent = await send(me, [uuid(body.to)], 'friend_accepted', 'friend_requests', 'New friend', `${name} accepted your friend request`, {});
        break;
      }
      case 'drive_invite': {
        const drive = await activeDriveFor(me, uuid(body.drive_id));
        const to: string[] = Array.isArray(body.to) ? body.to.slice(0, 20).map(uuid) : [];
        const friends: string[] = [];
        for (const id of to) if (await areFriends(me, id)) friends.push(id);
        sent = await send(me, friends, 'drive_invite', 'drive_invites', `Join ${drive.name}`, `${name} invited you to a group drive`, { code: drive.code });
        break;
      }
      case 'member_joined':
      case 'arrived': {
        const drive = await activeDriveFor(me, uuid(body.drive_id));
        const { data: members } = await admin.from('group_members').select('user_id').eq('drive_id', drive.id);
        const text = body.type === 'arrived' ? `${name} arrived at the destination` : `${name} joined the drive`;
        sent = await send(me, (members ?? []).map((m) => m.user_id), body.type, 'drive_activity', drive.name, text, { drive_id: drive.id });
        break;
      }
      case 'admin_message': {
        // The send was created by admin_send_message() (which checks the caller is an admin).
        // Claim it atomically: only its own admin, only once, only while fresh.
        const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
        const { data: claimed } = await admin
          .from('message_sends')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', uuid(body.send_id))
          .eq('sent_by', me)
          .is('pushed_at', null)
          .gte('created_at', tenMinAgo)
          .select('id, audience, title, body')
          .maybeSingle();
        if (!claimed) throw new HttpError(403, 'not your send, or already pushed');
        const recipients: string[] = [];
        for (let from = 0; ; from += 1000) {
          const { data } = await admin.from('messages').select('user_id').eq('send_id', claimed.id).range(from, from + 999);
          recipients.push(...(data ?? []).map((m) => m.user_id));
          if (!data || data.length < 1000) break;
        }
        // Broadcasts respect "Announcements"; a note to one person always goes through.
        const pref = claimed.audience === 'user' ? null : 'announcements';
        // No sender → no per-sender rate limit (and an admin can message themselves to test).
        sent = await send(null, recipients, 'admin_message', pref, claimed.title, claimed.body, { send_id: claimed.id });
        await admin.from('message_sends').update({ pushed: sent }).eq('id', claimed.id);
        break;
      }
      default:
        return json({ error: 'unknown type' }, 400);
    }
    return json({ sent });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'failed' }, 500);
  }
});
