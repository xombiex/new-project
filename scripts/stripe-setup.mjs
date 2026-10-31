// Sets up (or updates) Convoy's plans in a Stripe account: products, prices, Customer Portal and the
// two webhooks the `stripe` edge function listens to. Safe to run again; it only changes what differs.
//
//   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
//
// Run it in your own terminal so the key never leaves your machine. Change a price here and run it
// again: Stripe prices can't be edited, so it makes a new one and moves the lookup key across. People
// already subscribed stay on their old price until you migrate them.
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('Set STRIPE_SECRET_KEY first (see the top of this file).');
  process.exit(1);
}

const WEBHOOK_URL = 'https://qdcdveoidmnwqnabfuvd.supabase.co/functions/v1/stripe';
const SITE = 'https://convoy-drab.vercel.app';

/** Amounts in cents. The lookup keys are what the edge function asks Stripe for. */
const PRODUCTS = [
  {
    name: 'Convoy Pro',
    prices: [
      { lookup: 'convoy_pro_monthly', amount: 500, interval: 'month' },
      { lookup: 'convoy_pro_yearly', amount: 4000, interval: 'year' },
    ],
  },
  { name: 'Convoy Clubs', prices: [{ lookup: 'convoy_clubs_monthly', amount: 1500, interval: 'month' }] },
  { name: 'Convoy Style Pack', prices: [{ lookup: 'convoy_style_pack', amount: 500 }] },
];

const WEBHOOKS = [
  {
    vault: 'stripe_webhook_secret',
    description: 'Convoy: subscriptions, style pack, ticket payments & refunds',
    enabled_events: [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'charge.refunded',
    ],
  },
  {
    vault: 'stripe_connect_webhook_secret',
    description: 'Convoy: organizer (connected account) payout status',
    enabled_events: ['account.updated'],
    connect: true,
  },
];

/** Stripe's API takes form-encoded bodies with bracketed keys for nested objects and arrays. */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, path, params = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' ? `?${form(params)}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? form(params) : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${body?.error?.message ?? res.status}`);
  return body;
}

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

async function setUpProducts() {
  const { data: existing } = await stripe('GET', 'products', { active: true, limit: 100 });
  const portalProducts = [];
  for (const def of PRODUCTS) {
    const product = existing.find((p) => p.name === def.name) ?? (await stripe('POST', 'products', { name: def.name }));
    const recurring = [];
    for (const p of def.prices) {
      const { data } = await stripe('GET', 'prices', { lookup_keys: [p.lookup], active: true });
      let price = data[0];
      if (price?.unit_amount === p.amount && price.recurring?.interval === p.interval) {
        console.log(`  ${p.lookup}: already ${money(p.amount)}`);
      } else {
        const old = price;
        price = await stripe('POST', 'prices', {
          product: product.id,
          currency: 'usd',
          unit_amount: p.amount,
          recurring: p.interval ? { interval: p.interval } : undefined,
          lookup_key: p.lookup,
          transfer_lookup_key: true,
        });
        if (old) await stripe('POST', `prices/${old.id}`, { active: false });
        console.log(`  ${p.lookup}: now ${money(p.amount)}${old ? ` (was ${money(old.unit_amount)})` : ''}`);
      }
      if (p.interval) recurring.push(price.id);
    }
    if (recurring.length) portalProducts.push({ product: product.id, prices: recurring });
  }
  return portalProducts;
}

async function setUpPortal(products) {
  const settings = {
    business_profile: { privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms` },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products },
    },
  };
  const { data } = await stripe('GET', 'billing_portal/configurations', { active: true, limit: 100 });
  const current = data.find((c) => c.is_default) ?? data[0];
  if (current) await stripe('POST', `billing_portal/configurations/${current.id}`, settings);
  else await stripe('POST', 'billing_portal/configurations', settings);
  console.log(`  ${current ? 'updated' : 'created'}`);
}

/** Stripe shows a webhook's signing secret only when it's created, so print any new ones. */
async function setUpWebhooks() {
  const { data } = await stripe('GET', 'webhook_endpoints', { limit: 100 });
  const fresh = [];
  for (const { vault, ...def } of WEBHOOKS) {
    const current = data.find((e) => e.url === WEBHOOK_URL && e.enabled_events.includes(def.enabled_events[0]));
    if (current) {
      await stripe('POST', `webhook_endpoints/${current.id}`, { description: def.description, enabled_events: def.enabled_events });
      console.log(`  ${def.description}: already there`);
    } else {
      const created = await stripe('POST', 'webhook_endpoints', { url: WEBHOOK_URL, ...def });
      fresh.push([vault, created.secret]);
      console.log(`  ${def.description}: created`);
    }
  }
  return fresh;
}

const secretSql = (name, value) => `select vault.update_secret((select id from vault.secrets where name = '${name}'), '${value}');`;

const { livemode } = (await stripe('GET', 'balance'));
console.log(`Stripe ${livemode ? 'LIVE' : 'test'} mode\n\nPrices`);
const products = await setUpProducts();
console.log('\nCustomer Portal');
await setUpPortal(products);
console.log('\nWebhooks');
const fresh = await setUpWebhooks();

console.log('\nDone. Last step: run this in Supabase > SQL Editor, with your key pasted in. Keep it out of chats and commits.\n');
console.log(secretSql('stripe_secret_key', '<your secret key>'));
for (const [name, value] of fresh) console.log(secretSql(name, value));
if (!fresh.length) console.log('-- The webhooks already existed, so their signing secrets stay as they are.');
