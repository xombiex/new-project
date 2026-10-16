// Convoy × Stripe
//
// Web billing (Convoy is the merchant)
//   POST { action: 'plans' }                         → prices for the web paywall (public)
//   POST { action: 'subscribe', plan }               → Checkout URL (pro_monthly | pro_yearly | clubs_monthly | style_pack)
//   POST { action: 'portal' }                        → Customer Portal URL (cancel, switch plan, update card)
//
// Event-ticket marketplace (Stripe Connect, destination charges, platform-owned pricing & losses)
//   POST { action: 'connect_onboard', club_id }      → onboarding link (or Express dashboard link once set up)
//   POST { action: 'checkout', event_id }            → Checkout URL for a ticket
//
// Webhook (Stripe-Signature header): checkout.session.completed|async_payment_succeeded,
//   customer.subscription.created|updated|deleted,
//   charge.refunded, account.updated (connected accounts).
// GET ?page=…[&to=web]                             → 302 back into the app (convoy://stripe-return) or the web app
// Any POST may pass { web: true } so Stripe returns to the web app instead of the native one.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET, optional PLATFORM_FEE_PERCENT
// (default 5). Each is read from the function env first, else from Supabase Vault
// (stripe_secret_key, stripe_webhook_secret, stripe_connect_webhook_secret) via public.app_secret().
import { createClient } from 'npm:@supabase/supabase-js@2';

let STRIPE_KEY: string | undefined;
let WEBHOOK_SECRETS: string[] = [];
const FEE_PERCENT = Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? '5');
const SELF_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe`;
const WEB_APP_URL = Deno.env.get('WEB_APP_URL') ?? 'https://convoy-drab.vercel.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIAL_DAYS = 7;

/** Web plans → Stripe price lookup keys (created in the Stripe dashboard / API). */
const PLANS = {
  pro_monthly: { lookup: 'convoy_pro_monthly', entitlement: 'pro', mode: 'subscription', trial: true },
  pro_yearly: { lookup: 'convoy_pro_yearly', entitlement: 'pro', mode: 'subscription', trial: true },
  clubs_monthly: { lookup: 'convoy_clubs_monthly', entitlement: 'club', mode: 'subscription', trial: false },
  style_pack: { lookup: 'convoy_style_pack', entitlement: 'cosmetics', mode: 'payment', trial: false },
} as const;
type PlanId = keyof typeof PLANS;
const SUBSCRIPTION_ENTITLEMENTS = ['pro', 'club'];

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

/** Env var, else Vault. Cached once found; retried (each minute) while missing. */
let secretsLoadedAt = 0;
async function loadSecrets() {
  if (STRIPE_KEY && WEBHOOK_SECRETS.length) return;
  if (Date.now() - secretsLoadedAt < 60_000) return;
  secretsLoadedAt = Date.now();
  const vault = async (name: string) => {
    const { data } = await admin.rpc('app_secret', { p_name: name });
    return (data as string | null) ?? undefined;
  };
  STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? (await vault('stripe_secret_key'));
  WEBHOOK_SECRETS = [
    Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? (await vault('stripe_webhook_secret')),
    Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? (await vault('stripe_connect_webhook_secret')),
  ].filter(Boolean) as string[];
}

// ─── Stripe REST helpers ─────────────────────────────────────────────────

/** Stripe's API takes form-encoded bodies with bracketed keys for nested objects and arrays. */
function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}, idempotencyKey?: string) {
  const qs = method === 'GET' ? `?${form(params)}` : '';
  const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: method === 'POST' ? form(params) : undefined,
  });
  const body = await res.json();
  if (res.status === 401) {
    // Key was rolled: drop the cached copy so the next request re-reads Vault.
    STRIPE_KEY = undefined;
    secretsLoadedAt = 0;
  }
  if (!res.ok) throw new HttpError(502, body?.error?.message ?? 'Stripe error');
  return body;
}

async function priceFor(lookup: string) {
  const { data } = await stripe('GET', 'prices', { lookup_keys: [lookup], active: true, expand: ['data.product'] });
  if (!data?.length) throw new HttpError(500, `price ${lookup} not found`);
  return data[0];
}

async function verifySignature(raw: string, header: string | null) {
  if (!header || WEBHOOK_SECRETS.length === 0) return false;
  const t = Number(header.split(',').find((p) => p.startsWith('t='))?.slice(2));
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || sigs.length === 0) return false;
  for (const secret of WEBHOOK_SECRETS) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
    const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
    // constant-time compare
    if (sigs.some((s) => s.length === expected.length && [...s].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0)) return true;
  }
  return false;
}

/**
 * Stripe needs https return URLs; Supabase won't serve HTML from functions, so bounce
 * straight back into the app. The app's auth-session browser closes on this redirect.
 */
function backToApp(status: string, web: boolean) {
  const base = web ? `${WEB_APP_URL}/stripe-return` : 'convoy://stripe-return';
  return new Response(null, { status: 302, headers: { Location: `${base}?status=${encodeURIComponent(status)}` } });
}

// ─── Web billing ─────────────────────────────────────────────────────────

async function customerFor(userId: string, email: string | undefined) {
  const { data } = await admin.from('stripe_customers').select('customer_id, trial_used').eq('user_id', userId).maybeSingle();
  if (data) return data;
  // Idempotency key: a double-tap can't create two Customers for one user.
  const customer = await stripe('POST', 'customers', { email, metadata: { user_id: userId } }, `customer-${userId}`);
  const row = { user_id: userId, customer_id: customer.id as string, trial_used: false };
  const { error } = await admin.from('stripe_customers').insert(row);
  if (error?.code === '23505') {
    const { data: existing } = await admin.from('stripe_customers').select('customer_id, trial_used').eq('user_id', userId).single();
    return existing!;
  }
  return row;
}

async function hasStripeEntitlement(userId: string, entitlement: string) {
  const { data } = await admin.from('entitlements').select('expires_at').eq('user_id', userId).eq('entitlement', entitlement).eq('source', 'stripe').maybeSingle();
  return Boolean(data && (data.expires_at == null || Date.parse(data.expires_at) > Date.now()));
}

type PlanInfo = { amount: number; currency: string; interval: string | null; name: string };
let plansCache: { at: number; plans: Record<string, PlanInfo> } | null = null;

/** Public endpoint, so cache briefly instead of hitting Stripe on every paywall open. */
async function plans() {
  if (plansCache && Date.now() - plansCache.at < 10 * 60_000) return plansCache.plans;
  const out: Record<string, PlanInfo> = {};
  for (const [id, p] of Object.entries(PLANS)) {
    const price = await priceFor(p.lookup);
    out[id] = { amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval ?? null, name: price.product?.name ?? id };
  }
  plansCache = { at: Date.now(), plans: out };
  return out;
}

async function subscribe(userId: string, email: string | undefined, planId: PlanId, ret: string) {
  const plan = PLANS[planId];
  if (!plan) throw new HttpError(400, 'unknown plan');
  const customer = await customerFor(userId, email);

  // Already subscribed on the web → send them to manage it instead of double-billing.
  if (await hasStripeEntitlement(userId, plan.entitlement)) {
    if (plan.mode === 'payment') throw new HttpError(409, 'you already own this');
    return portal(customer.customer_id, ret);
  }

  const price = await priceFor(plan.lookup);
  const common = {
    customer: customer.customer_id,
    client_reference_id: userId,
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { kind: planId === 'style_pack' ? 'style_pack' : 'subscription', user_id: userId, plan: planId },
    success_url: `${ret}subscribed`,
    cancel_url: `${ret}cancel`,
  };

  const session =
    plan.mode === 'subscription'
      ? await stripe('POST', 'checkout/sessions', {
          ...common,
          mode: 'subscription',
          allow_promotion_codes: true,
          // Card collected up front; auto-converts to paid when the trial ends.
          payment_method_collection: 'always',
          subscription_data: {
            metadata: { user_id: userId, entitlement: plan.entitlement },
            ...(plan.trial && !customer.trial_used ? { trial_period_days: TRIAL_DAYS } : {}),
          },
        })
      : await stripe('POST', 'checkout/sessions', {
          ...common,
          mode: 'payment',
          payment_intent_data: { metadata: { kind: 'style_pack', user_id: userId } },
        });
  return session.url as string;
}

async function portal(customerId: string, ret: string) {
  const session = await stripe('POST', 'billing_portal/sessions', { customer: customerId, return_url: `${ret}portal` });
  return session.url as string;
}

/**
 * Recompute a customer's subscription entitlements from Stripe (the source of truth).
 * Idempotent, so it's safe for every subscription event, retries and out-of-order delivery.
 */
async function syncSubscriptions(customerId: string) {
  const { data: link } = await admin.from('stripe_customers').select('user_id').eq('customer_id', customerId).maybeSingle();
  if (!link) return;
  const userId = link.user_id as string;
  const { data: subs } = await stripe('GET', 'subscriptions', { customer: customerId, status: 'all', limit: 100 });

  const grants = new Map<string, string>();
  let trialUsed = false;
  for (const s of subs ?? []) {
    if (s.trial_start) trialUsed = true;
    // past_due keeps access while Smart Retries try the card; unpaid/canceled/incomplete do not.
    if (!['active', 'trialing', 'past_due'].includes(s.status)) continue;
    const ent = s.metadata?.entitlement ?? s.items?.data?.[0]?.price?.metadata?.entitlement;
    if (!SUBSCRIPTION_ENTITLEMENTS.includes(ent)) continue;
    // Newer API versions moved current_period_end onto subscription items.
    const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
    const iso = new Date(end * 1000).toISOString();
    if (!grants.has(ent) || grants.get(ent)! < iso) grants.set(ent, iso);
  }

  const keep = [...grants.keys()];
  let stale = admin.from('entitlements').delete().eq('user_id', userId).eq('source', 'stripe').in('entitlement', SUBSCRIPTION_ENTITLEMENTS);
  if (keep.length) stale = stale.not('entitlement', 'in', `(${keep.join(',')})`);
  await stale;
  if (keep.length) {
    await admin.from('entitlements').upsert(
      keep.map((entitlement) => ({ user_id: userId, entitlement, source: 'stripe', expires_at: grants.get(entitlement), updated_at: new Date().toISOString() }))
    );
  }
  if (trialUsed) await admin.from('stripe_customers').update({ trial_used: true }).eq('user_id', userId);
}

// ─── Event-ticket marketplace (Connect) ──────────────────────────────────

async function onboard(me: string, clubId: string, ret: string) {
  const { data: role } = await admin.from('club_members').select('role').eq('club_id', clubId).eq('user_id', me).maybeSingle();
  if (role?.role !== 'owner') throw new HttpError(403, 'only the club owner can set up payouts');
  let { data: payout } = await admin.from('club_payouts').select('stripe_account_id, charges_enabled').eq('club_id', clubId).maybeSingle();
  if (!payout) {
    // Marketplace recipient: platform owns pricing + loss liability, Express dashboard,
    // and only the transfers capability (organizers receive payouts; they don't take card payments).
    const account = await stripe(
      'POST',
      'accounts',
      {
        country: 'US',
        controller: {
          fees: { payer: 'application' },
          losses: { payments: 'application' },
          stripe_dashboard: { type: 'express' },
        },
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: 'Car club events and drives organized on Convoy' },
        metadata: { club_id: clubId },
      },
      `account-${clubId}`
    );
    payout = { stripe_account_id: account.id, charges_enabled: false };
    await admin.from('club_payouts').insert({ club_id: clubId, ...payout });
  }
  if (payout.charges_enabled) {
    const link = await stripe('POST', `accounts/${payout.stripe_account_id}/login_links`);
    return link.url as string;
  }
  const link = await stripe('POST', 'account_links', {
    account: payout.stripe_account_id,
    refresh_url: `${ret}refresh`,
    return_url: `${ret}return`,
    type: 'account_onboarding',
  });
  return link.url as string;
}

async function ticketCheckout(me: string, eventId: string, ret: string) {
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

  const meta = { kind: 'ticket', event_id: ev.id, user_id: me };
  const session = await stripe('POST', 'checkout/sessions', {
    mode: 'payment',
    // Managed Payments (on by default for this account) doesn't support Connect; tickets are a
    // real-world service sold by organizers, so this session is a normal destination charge.
    managed_payments: { enabled: false },
    line_items: [{ quantity: 1, price_data: { currency: ev.currency, unit_amount: ev.price_cents, product_data: { name: ev.title } } }],
    // Destination charge: Convoy is merchant of record, organizer receives the rest automatically.
    payment_intent_data: {
      application_fee_amount: Math.round((ev.price_cents * FEE_PERCENT) / 100),
      transfer_data: { destination: payout.stripe_account_id },
      metadata: meta,
    },
    client_reference_id: me,
    metadata: meta,
    success_url: `${ret}paid`,
    cancel_url: `${ret}cancel`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  return session.url as string;
}

// ─── Webhooks ────────────────────────────────────────────────────────────

async function webhook(raw: string) {
  const event = JSON.parse(raw);
  const obj = event.data.object;

  switch (event.type) {
    // Cards confirm immediately (completed + paid); some wallets/bank methods confirm later
    // (completed + unpaid, then async_payment_succeeded). Only fulfil once paid.
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const kind = obj.metadata?.kind;
      const userId = obj.metadata?.user_id;
      if (!UUID.test(userId ?? '')) return;
      if (kind === 'ticket' && obj.payment_status === 'paid' && UUID.test(obj.metadata?.event_id ?? '')) {
        const { error } = await admin.from('event_rsvps').upsert({
          event_id: obj.metadata.event_id,
          user_id: userId,
          status: 'going',
          paid: true,
          stripe_session_id: obj.id,
          stripe_payment_intent: obj.payment_intent,
          updated_at: new Date().toISOString(),
        });
        // Oversold in a race: the purchase is in Stripe; the organizer can refund it.
        if (error) console.error('Ticket record failed', obj.metadata.event_id, userId, error.message);
      } else if (kind === 'style_pack' && obj.payment_status === 'paid') {
        await admin.from('entitlements').upsert({ user_id: userId, entitlement: 'cosmetics', source: 'stripe', expires_at: null, updated_at: new Date().toISOString() });
      } else if (kind === 'subscription' && obj.customer) {
        await syncSubscriptions(obj.customer);
      }
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscriptions(obj.customer);
      return;
    case 'charge.refunded': {
      if (!obj.refunded || !obj.payment_intent) return; // partial refunds keep the purchase
      const pi = await stripe('GET', `payment_intents/${obj.payment_intent}`);
      const userId = pi.metadata?.user_id;
      if (pi.metadata?.kind === 'ticket') {
        await admin.from('event_rsvps').update({ paid: false, status: 'not_going', updated_at: new Date().toISOString() }).eq('stripe_payment_intent', obj.payment_intent);
      } else if (pi.metadata?.kind === 'style_pack' && UUID.test(userId ?? '')) {
        await admin.from('entitlements').delete().eq('user_id', userId).eq('entitlement', 'cosmetics').eq('source', 'stripe');
      }
      return;
    }
    case 'account.updated':
      // Marketplace recipients are ready once the transfers capability is active.
      await admin
        .from('club_payouts')
        .update({ charges_enabled: obj.capabilities?.transfers === 'active', updated_at: new Date().toISOString() })
        .eq('stripe_account_id', obj.id);
      return;
  }
}

// ─── Router ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const status = url.searchParams.get('page');
    if (status && ['paid', 'cancel', 'return', 'refresh', 'subscribed', 'portal'].includes(status)) return backToApp(status, url.searchParams.get('to') === 'web');
    return new Response('Not found', { status: 404 });
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  await loadSecrets();
  if (!STRIPE_KEY) return json({ error: 'payments not configured' }, 503);

  try {
    const sig = req.headers.get('Stripe-Signature');
    if (sig) {
      const raw = await req.text();
      if (!(await verifySignature(raw, sig))) return json({ error: 'bad signature' }, 400);
      await webhook(raw);
      return json({ received: true });
    }

    const body = await req.json();
    if (body.action === 'plans') return json({ plans: await plans() });

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(jwt);
    const user = auth?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const ret = body.web === true ? `${SELF_URL}?to=web&page=` : `${SELF_URL}?page=`;
    switch (body.action) {
      case 'subscribe':
        if (typeof body.plan !== 'string' || !Object.hasOwn(PLANS, body.plan)) return json({ error: 'unknown plan' }, 400);
        return json({ url: await subscribe(user.id, user.email, body.plan as PlanId, ret) });
      case 'portal': {
        const { data } = await admin.from('stripe_customers').select('customer_id').eq('user_id', user.id).maybeSingle();
        if (!data) return json({ error: 'no web subscription' }, 404);
        return json({ url: await portal(data.customer_id, ret) });
      }
      case 'connect_onboard':
        if (!UUID.test(body.club_id ?? '')) break;
        return json({ url: await onboard(user.id, body.club_id, ret) });
      case 'checkout':
        if (!UUID.test(body.event_id ?? '')) break;
        return json({ url: await ticketCheckout(user.id, body.event_id, ret) });
    }
    return json({ error: 'bad request' }, 400);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'failed' }, 500);
  }
});
