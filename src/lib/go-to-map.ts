import type { useRouter } from 'expo-router';

/** Close any modals (sign-in, profile setup) and land on the Drive map. */
export function goToMap(router: ReturnType<typeof useRouter>) {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}
