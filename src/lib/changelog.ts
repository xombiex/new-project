import data from '@/data/changelog.json';

export type ReleaseItem = { icon: string; title: string; text: string };
export type Release = { id: string; date: string; title: string; items: ReleaseItem[] };

/** Every update, newest first (src/data/changelog.json). */
export const RELEASES: Release[] = data.releases;
export const LATEST_RELEASE: Release | undefined = RELEASES[0];

/**
 * Should "What's new" open by itself? Once per release, for people past the welcome screens.
 * Finishing the welcome marks the latest as seen, so `null` here means someone who was already
 * onboarded before this screen existed.
 */
export function hasUnseenRelease(seen: string | null): boolean {
  return Boolean(LATEST_RELEASE && (seen === null || LATEST_RELEASE.id > seen));
}

/** "Oct 21, 2026" from "2026-10-21", without time zone surprises. */
export function releaseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
