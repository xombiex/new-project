// Mirrors RevenueCat entitlements into public.entitlements (the server's source of truth).
//
// Two callers:
//   1. RevenueCat webhook  – Authorization header = REVENUECAT_WEBHOOK_AUTH (set in RevenueCat dashboard)
//   2. The app after a purchase – Authorization: Bearer <user JWT>; syncs only that user
//
// Either way we re-read the subscriber from RevenueCat's REST API rather than trusting
// event payloads, so every event type (purchase, renewal, refund, transfer…) is handled the same.
//
// Secrets: REVENUECAT_SECRET_KEY (RevenueCat → API keys → secret), REVENUECAT_WEBHOOK_AUTH (any long random string).
import { createClient } from 'npm:@supabase/supabase-js@2';

const RC_SECRET = Deno.env.get('REVENUECAT_SECRET_KEY');
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
const KNOWN = ['pro', 'cosmetics', 'club'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sync(userId: string) {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${RC_SECRET}` },
  });
  if (!res.ok) throw new Error(`RevenueCat lookup failed (${res.status})`);
  const { subscriber } = await res.json();
  const entitlements: Record<string, { expires_date: string | null }> = subscriber?.entitlements ?? {};
  const rows = Object.entries(entitlements)
    .filter(([id]) => KNOWN.includes(id))
    .map(([id, e]) => ({
      user_id: userId,
      entitlement: id,
      expires_at: e.expires_date,
      source: 'revenuecat',
      updated_at: new Date().toISOString(),
    }));

  // Drop RevenueCat-sourced rows RevenueCat no longer reports (e.g. after a transfer).
  let stale = admin.from('entitlements').delete().eq('user_id', userId).eq('source', 'revenuecat');
  if (rows.length) stale = stale.not('entitlement', 'in', `(${rows.map((r) => r.entitlement).join(',')})`);
  const { error: delError } = await stale;
  if (delError) throw delError;

  if (rows.length) {
    const { error } = await admin.from('entitlements').upsert(rows);
    // 23503: user no longer exists in auth.users — nothing to grant.
    if (error && error.code !== '23503') throw error;
  }
  return rows.map(({ entitlement, expires_at }) => ({ entitlement, expires_at }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!RC_SECRET) return json({ error: 'purchases not configured' }, 503);

  const auth = req.headers.get('Authorization') ?? '';

  // 1. RevenueCat webhook
  if (WEBHOOK_AUTH && (auth === WEBHOOK_AUTH || auth === `Bearer ${WEBHOOK_AUTH}`)) {
    const { event } = await req.json();
    const ids = new Set<string>(
      [
        event?.app_user_id,
        event?.original_app_user_id,
        ...(event?.aliases ?? []),
        ...(event?.transferred_from ?? []),
        ...(event?.transferred_to ?? []),
      ].filter((id): id is string => typeof id === 'string' && UUID.test(id))
    );
    try {
      for (const id of ids) await sync(id);
    } catch (e) {
      console.error(e);
      // Non-2xx makes RevenueCat retry later.
      return json({ error: 'sync failed' }, 500);
    }
    return json({ synced: ids.size });
  }

  // 2. Signed-in app user asking to refresh their own entitlements
  const jwt = auth.replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  try {
    return json({ entitlements: await sync(data.user.id) });
  } catch (e) {
    console.error(e);
    return json({ error: 'sync failed' }, 502);
  }
});
