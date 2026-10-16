// Paid club event tickets via Stripe Connect (Express accounts).
//
//   POST  { action: 'connect_onboard', club_id }  (club owner)  → { url } Stripe onboarding / dashboard
//   POST  { action: 'checkout', event_id }        (club member) → { url } Stripe Checkout
//   POST  Stripe webhook (Stripe-Signature header)              → marks tickets paid, payout status
//   GET   ?page=return|refresh|paid|cancel                      → redirect back into the app
//
// Money flow: the buyer pays the club's connected account directly; Convoy takes
// PLATFORM_FEE_PERCENT (default 5) as an application fee.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, optional PLATFORM_FEE_PERCENT.
// Webhook events needed: checkout.session.completed, account.updated (enable
// "events on connected accounts" for the account.updated endpoint).
import { createClient } from 'npm:@supabase/supabase-js@2';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const FEE_PERCENT = Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? '5');
const SELF_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Stripe's API takes form-encoded bodies with bracketed keys for nested objects. */
function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(params),
  });
  const body = await res.json();
  if (!res.ok) throw new HttpError(502, body?.error?.message ?? 'Stripe error');
  return body;
}

async function verifySignature(raw: string, header: string | null) {
  if (!header || !WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2 && p[0] === 't'));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || sigs.length === 0) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  return sigs.some((s) => s.length === expected.length && [...s].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

/**
 * Stripe needs https return URLs; Supabase won't serve HTML from functions, so bounce
 * straight back into the app. The app's auth-session browser closes on this redirect.
 */
function backToApp(status: string) {
  return new Response(null, { status: 302, headers: { Location: `convoy://stripe-return?status=${encodeURIComponent(status)}` } });
}

async function onboard(me: string, clubId: string) {
  const { data: role } = await admin.from('club_members').select('role').eq('club_id', clubId).eq('user_id', me).maybeSingle();
  if (role?.role !== 'owner') throw new HttpError(403, 'only the club owner can set up payouts');
  let { data: payout } = await admin.from('club_payouts').select('stripe_account_id, charges_enabled').eq('club_id', clubId).maybeSingle();
  if (!payout) {
    const account = await stripe('accounts', {
      type: 'express',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { club_id: clubId },
    });
    payout = { stripe_account_id: account.id, charges_enabled: false };
    await admin.from('club_payouts').insert({ club_id: clubId, ...payout });
  }
  if (payout.charges_enabled) {
    const link = await stripe(`accounts/${payout.stripe_account_id}/login_links`);
    return link.url as string;
  }
  const link = await stripe('account_links', {
    account: payout.stripe_account_id,
    refresh_url: `${SELF_URL}?page=refresh`,
    return_url: `${SELF_URL}?page=return`,
    type: 'account_onboarding',
  });
  return link.url as string;
}

async function checkout(me: string, eventId: string) {
  const { data: ev } = await admin
    .from('club_events')
    .select('id, club_id, title, starts_at, price_cents, currency, capacity')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev) throw new HttpError(404, 'event not found');
  if (ev.price_cents <= 0) throw new HttpError(400, 'event is free');
  if (Date.parse(ev.starts_at) < Date.now()) throw new HttpError(400, 'event already started');
  const { data: member } = await admin.from('club_members').select('role').eq('club_id', ev.club_id).eq('user_id', me).maybeSingle();
  if (!member) throw new HttpError(403, 'club members only');
  const { data: existing } = await admin.from('event_rsvps').select('paid').eq('event_id', ev.id).eq('user_id', me).maybeSingle();
  if (existing?.paid) throw new HttpError(400, 'you already have a ticket');
  if (ev.capacity) {
    const { count } = await admin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('status', 'going');
    if ((count ?? 0) >= ev.capacity) throw new HttpError(409, 'event is full');
  }
  const { data: payout } = await admin.from('club_payouts').select('stripe_account_id, charges_enabled').eq('club_id', ev.club_id).maybeSingle();
  if (!payout?.charges_enabled) throw new HttpError(400, 'this club cannot sell tickets yet');

  const session = await stripe('checkout/sessions', {
    mode: 'payment',
    line_items: { 0: { quantity: 1, price_data: { currency: ev.currency, unit_amount: ev.price_cents, product_data: { name: ev.title } } } },
    payment_intent_data: {
      application_fee_amount: Math.round((ev.price_cents * FEE_PERCENT) / 100),
      transfer_data: { destination: payout.stripe_account_id },
    },
    client_reference_id: me,
    metadata: { event_id: ev.id, user_id: me },
    success_url: `${SELF_URL}?page=paid`,
    cancel_url: `${SELF_URL}?page=cancel`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  return session.url as string;
}

async function webhook(raw: string) {
  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const eventId = s.metadata?.event_id;
    const userId = s.metadata?.user_id;
    if (s.payment_status === 'paid' && UUID.test(eventId ?? '') && UUID.test(userId ?? '')) {
      const { error } = await admin.from('event_rsvps').upsert({
        event_id: eventId,
        user_id: userId,
        status: 'going',
        paid: true,
        stripe_session_id: s.id,
        updated_at: new Date().toISOString(),
      });
      // Oversold in a race: still record the purchase (organizer can refund from Stripe).
      if (error) console.error('Ticket record failed', eventId, userId, error.message);
    }
  } else if (event.type === 'account.updated') {
    const a = event.data.object;
    await admin.from('club_payouts').update({ charges_enabled: Boolean(a.charges_enabled), updated_at: new Date().toISOString() }).eq('stripe_account_id', a.id);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const status = url.searchParams.get('page');
    if (status && ['paid', 'cancel', 'return', 'refresh'].includes(status)) return backToApp(status);
    return new Response('Not found', { status: 404 });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!STRIPE_KEY) return json({ error: 'payments not configured' }, 503);

  try {
    const sig = req.headers.get('Stripe-Signature');
    if (sig) {
      const raw = await req.text();
      if (!(await verifySignature(raw, sig))) return json({ error: 'bad signature' }, 400);
      await webhook(raw);
      return json({ received: true });
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(jwt);
    const me = auth?.user?.id;
    if (!me) return json({ error: 'unauthorized' }, 401);

    const body = await req.json();
    if (body.action === 'connect_onboard' && UUID.test(body.club_id ?? '')) return json({ url: await onboard(me, body.club_id) });
    if (body.action === 'checkout' && UUID.test(body.event_id ?? '')) return json({ url: await checkout(me, body.event_id) });
    return json({ error: 'bad request' }, 400);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'failed' }, 500);
  }
});
