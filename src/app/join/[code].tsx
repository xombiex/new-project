import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Invite links: /join/<code>. A 6-character code is a group drive, 8 is a club. Either way, open
 * the Convoy tab with the code filled in, one tap from joining.
 */
export default function JoinLink() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const clean = String(code).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (clean.length === 8) return <Redirect href={{ pathname: '/convoy', params: { club: clean } }} />;
  return <Redirect href={{ pathname: '/convoy', params: clean.length === 6 ? { code: clean } : {} }} />;
}
