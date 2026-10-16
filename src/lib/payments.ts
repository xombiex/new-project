import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

/**
 * Paid event tickets go through Stripe Checkout in the browser (real-world events are
 * allowed outside in-app purchase). Organizers get paid via Stripe Connect; Convoy keeps
 * a small platform fee. All Stripe calls happen in the `stripe` edge function.
 */
async function openStripe(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('stripe', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    return detail?.error === 'payments not configured' ? 'Payments aren’t set up yet' : (detail?.error ?? error.message);
  }
  if (!data?.url) return 'Could not start checkout';
  await WebBrowser.openBrowserAsync(data.url);
  return null;
}

export function setUpPayouts(clubId: string) {
  return openStripe({ action: 'connect_onboard', club_id: clubId });
}

export function buyTicket(eventId: string) {
  return openStripe({ action: 'checkout', event_id: eventId });
}

export function formatPrice(cents: number, currency = 'usd') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
