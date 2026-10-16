import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { subscribeOnWeb, type WebPlanId } from '@/lib/payments';
import * as purchases from '@/lib/purchases';
import { supabase } from '@/lib/supabase';

/**
 * Entitlements (configure the same identifiers in RevenueCat):
 *   pro       – Convoy Pro subscription (includes cosmetics)
 *   cosmetics – one-time glow/map/vehicle pack
 *   club      – club organizer plan (includes Pro)
 */
export type Entitlement = 'pro' | 'cosmetics' | 'club';
const ALL: Entitlement[] = ['pro', 'cosmetics', 'club'];

type ProState = {
  /** active per the store SDK on this device (instant after purchase) */
  device: Entitlement[];
  /** active per our database (written by the RevenueCat webhook; what the server enforces) */
  server: Entitlement[];
  /** development builds only: pretend to own entitlements to test gated features */
  simulated: Entitlement[];
  /** true when something was bought through Stripe (manage it in the Customer Portal) */
  webBilling: boolean;
  has: (e: Entitlement) => boolean;
  identify: (userId: string | null) => Promise<void>;
  refreshServer: () => Promise<void>;
  /** Returns null on success or cancel, otherwise an error message. */
  purchase: (packageId: string) => Promise<string | null>;
  restore: () => Promise<string | null>;
  /** Stripe Checkout in the browser; resolves after the webhook has granted access (or times out). */
  buyOnWeb: (plan: WebPlanId) => Promise<string | null>;
  setSimulated: (e: Entitlement, on: boolean) => void;
};

/** Ask the server to re-read our purchases now instead of waiting for the webhook. */
async function syncServer() {
  const { error } = await supabase.functions.invoke('revenuecat-webhook', { body: {} });
  if (error) console.warn('Entitlement sync failed', error.message);
}

const known = (ids: string[]) => ids.filter((id): id is Entitlement => (ALL as string[]).includes(id));

/** Mirrors private.has_entitlement on the server: club ⊃ pro ⊃ cosmetics. */
function grants(owned: Set<Entitlement>, e: Entitlement) {
  if (owned.has(e) || owned.has('club')) return true;
  return e === 'cosmetics' && owned.has('pro');
}

export const usePro = create<ProState>()(
  persist(
    (set, get) => ({
      device: [],
      server: [],
      simulated: [],
      webBilling: false,

      has: (e) => {
        const { device, server, simulated } = get();
        return grants(new Set([...device, ...server, ...(__DEV__ ? simulated : [])]), e);
      },

      identify: async (userId) => {
        try {
          await purchases.identify(userId, (ids) => set({ device: known(ids) }));
        } catch (e) {
          console.warn('Purchases setup failed', e);
        }
        if (userId) await get().refreshServer();
        else set({ server: [] });
      },

      refreshServer: async () => {
        const { data, error } = await supabase.from('entitlements').select('entitlement, expires_at, source');
        if (error) {
          console.warn('Entitlement load failed', error.message);
          return;
        }
        const now = Date.now();
        const active = data.filter((r) => r.expires_at == null || Date.parse(r.expires_at) > now);
        set({
          server: known(active.map((r) => r.entitlement)),
          webBilling: data.some((r) => r.source === 'stripe'),
        });
      },

      purchase: async (packageId) => {
        try {
          const ids = await purchases.buy(packageId);
          if (ids === null) return null; // cancelled
          set({ device: known(ids) });
          await syncServer();
          await get().refreshServer();
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : 'Purchase failed';
        }
      },

      restore: async () => {
        try {
          set({ device: known(await purchases.restore()) });
          await syncServer();
          await get().refreshServer();
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : 'Restore failed';
        }
      },

      buyOnWeb: async (plan) => {
        const before = new Set(get().server);
        const err = await subscribeOnWeb(plan);
        if (err) return err;
        // The webhook usually lands within a second or two of returning from Checkout.
        for (let i = 0; i < 6; i++) {
          await get().refreshServer();
          if (get().server.some((e) => !before.has(e))) break;
          await new Promise((r) => setTimeout(r, 1500));
        }
        return null;
      },

      setSimulated: (e, on) => {
        const rest = get().simulated.filter((x) => x !== e);
        set({ simulated: on ? [...rest, e] : rest });
      },
    }),
    {
      name: 'convoy-pro',
      storage: createJSONStorage(() => AsyncStorage),
      // Cache last-known entitlements so unlocked features work offline.
      partialize: ({ device, server, simulated, webBilling }) => ({ device, server, simulated, webBilling }),
    }
  )
);

/** Hook form for components: re-renders when entitlements change. */
export function useEntitled(e: Entitlement) {
  return usePro((s) => {
    return grants(new Set([...s.device, ...s.server, ...(__DEV__ ? s.simulated : [])]), e);
  });
}
