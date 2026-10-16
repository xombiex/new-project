import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Everything Stripe goes through the `stripe` edge function and Stripe-hosted pages:
 *   - web subscriptions / Style Pack (Checkout + Customer Portal), Convoy is the merchant
 *   - event tickets (Checkout with destination charges to the organizer's connected account)
 * Card details never touch the app.
 */
async function callStripe(body: Record<string, unknown>): Promise<{ data?: any; error?: string }> {
  const { data, error } = await supabase.functions.invoke('stripe', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    return { error: detail?.error === 'payments not configured' ? 'Payments aren’t set up yet' : (detail?.error ?? error.message) };
  }
  return { data };
}

async function openStripe(body: Record<string, unknown>): Promise<string | null> {
  const web = Platform.OS === 'web';
  const { data, error } = await callStripe({ ...body, web });
  if (error) return error;
  if (!data?.url) return 'Could not start checkout';
  // On the web app, Stripe returns to /stripe-return on this site.
  if (web) {
    window.location.assign(data.url);
    return null;
  }
  // Closes itself when Stripe redirects back to convoy://stripe-return.
  await WebBrowser.openAuthSessionAsync(data.url, 'convoy://stripe-return');
  return null;
}

export function setUpPayouts(clubId: string) {
  return openStripe({ action: 'connect_onboard', club_id: clubId });
}

export function buyTicket(eventId: string) {
  return openStripe({ action: 'checkout', event_id: eventId });
}

// ─── Web billing ──────────────────────────────────────────────────────────

export type WebPlanId = 'pro_monthly' | 'pro_yearly' | 'clubs_monthly' | 'style_pack';
export type WebPlan = { amount: number; currency: string; interval: string | null; name: string };

/** Live prices from Stripe (so the app never shows a stale price). */
export async function fetchWebPlans(): Promise<Partial<Record<WebPlanId, WebPlan>>> {
  const { data } = await callStripe({ action: 'plans' });
  return data?.plans ?? {};
}

export function subscribeOnWeb(plan: WebPlanId) {
  return openStripe({ action: 'subscribe', plan });
}

/** Stripe Customer Portal: cancel, switch monthly/yearly, update card, invoices. */
export function openBillingPortal() {
  return openStripe({ action: 'portal' });
}

export function formatPrice(cents: number, currency = 'usd') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
