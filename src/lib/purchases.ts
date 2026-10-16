import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

/**
 * Thin wrapper over RevenueCat (App Store / Google Play billing). Keys are public SDK keys
 * from the RevenueCat dashboard; without them purchasing is disabled and the paywall says so.
 */
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

export const purchasesAvailable = Boolean(API_KEY);

export type PaywallPackage = {
  id: string;
  title: string;
  price: string;
  /** ISO-8601 period like P1M / P1Y, or null for one-time purchases */
  period: string | null;
};

let configured = false;
const packages = new Map<string, PurchasesPackage>();

export function activeEntitlements(info: CustomerInfo): string[] {
  return Object.keys(info.entitlements.active);
}

/** Configure once, then switch the RevenueCat user to match the signed-in Supabase user. */
export async function identify(userId: string | null, onChange: (entitlements: string[]) => void) {
  if (!API_KEY) return;
  if (!configured) {
    Purchases.configure({ apiKey: API_KEY, appUserID: userId ?? undefined });
    Purchases.addCustomerInfoUpdateListener((info) => onChange(activeEntitlements(info)));
    configured = true;
  } else if (userId) {
    await Purchases.logIn(userId);
  } else if (!(await Purchases.isAnonymous())) {
    await Purchases.logOut();
  }
  onChange(activeEntitlements(await Purchases.getCustomerInfo()));
}

/** Packages in a RevenueCat offering ("default" = Pro, "clubs", "cosmetics"). */
export async function fetchPackages(offeringId: string): Promise<PaywallPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[offeringId] ?? (offeringId === 'default' ? offerings.current : null);
  if (!offering) return [];
  return offering.availablePackages.map((p) => {
    packages.set(p.identifier + '@' + offeringId, p);
    return {
      id: p.identifier + '@' + offeringId,
      title: p.product.title,
      price: p.product.priceString,
      period: p.product.subscriptionPeriod,
    };
  });
}

/** Returns active entitlements, or null if the user cancelled. Throws on real errors. */
export async function buy(packageId: string): Promise<string[] | null> {
  const pkg = packages.get(packageId);
  if (!pkg) throw new Error('That option is no longer available');
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return activeEntitlements(customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return null;
    throw e;
  }
}

export async function restore(): Promise<string[]> {
  if (!configured) return [];
  return activeEntitlements(await Purchases.restorePurchases());
}
