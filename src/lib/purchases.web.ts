/** In-app purchases only exist in the iOS/Android app; the web build is for UI work. */
export const purchasesAvailable = false;

export type PaywallPackage = { id: string; title: string; price: string; period: string | null };

export async function identify(_userId: string | null, _onChange: (entitlements: string[]) => void) {}
export async function fetchPackages(_offeringId: string): Promise<PaywallPackage[]> {
  return [];
}
export async function buy(_packageId: string): Promise<string[] | null> {
  throw new Error('Purchases are only available in the mobile app');
}
export async function restore(): Promise<string[]> {
  return [];
}
