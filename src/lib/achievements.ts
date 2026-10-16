import { streaks, totals, type TripLike } from '@/lib/stats';

/**
 * Milestones reward distance, consistency and exploration — never speed, so nothing
 * in the app nudges anyone to drive faster.
 */
export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  goal: number;
  /** current progress toward `goal` */
  progress: (trips: TripLike[], now: number) => number;
};

const MI = 1609.344;
const hourOf = (t: TripLike) => new Date(t.startedAt).getHours();

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_drive', title: 'First Miles', description: 'Record your first drive', icon: 'flag-outline', goal: 1, progress: (t) => t.length },
  { id: 'regular', title: 'Regular', description: 'Record 10 drives', icon: 'repeat', goal: 10, progress: (t) => t.length },
  { id: 'veteran', title: 'Veteran', description: 'Record 100 drives', icon: 'shield-star-outline', goal: 100, progress: (t) => t.length },
  {
    id: 'century',
    title: 'Century Club',
    description: 'Drive 100 miles in total',
    icon: 'counter',
    goal: 100,
    progress: (t) => totals(t).distanceM / MI,
  },
  {
    id: 'thousand',
    title: 'Thousand Miler',
    description: 'Drive 1,000 miles in total',
    icon: 'road-variant',
    goal: 1000,
    progress: (t) => totals(t).distanceM / MI,
  },
  {
    id: 'ten_thousand',
    title: 'Long Haul',
    description: 'Drive 10,000 miles in total',
    icon: 'earth',
    goal: 10000,
    progress: (t) => totals(t).distanceM / MI,
  },
  {
    id: 'road_trip',
    title: 'Road Tripper',
    description: 'Complete a single drive of 100+ miles',
    icon: 'map-marker-distance',
    goal: 100,
    progress: (t) => Math.max(0, ...t.map((x) => x.distanceM / MI)),
  },
  {
    id: 'marathon',
    title: 'Marathon',
    description: 'Complete a single drive lasting 3+ hours',
    icon: 'timer-sand',
    goal: 3,
    progress: (t) => Math.max(0, ...t.map((x) => (x.endedAt - x.startedAt) / 3_600_000)),
  },
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Start a drive between 5 and 7 AM',
    icon: 'weather-sunset-up',
    goal: 1,
    progress: (t) => t.filter((x) => hourOf(x) >= 5 && hourOf(x) < 7).length,
  },
  {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Start a drive between midnight and 4 AM',
    icon: 'weather-night',
    goal: 1,
    progress: (t) => t.filter((x) => hourOf(x) < 4).length,
  },
  {
    id: 'streak_7',
    title: 'On a Roll',
    description: 'Drive 7 days in a row',
    icon: 'fire',
    goal: 7,
    progress: (t, now) => streaks(t, now).best,
  },
];

export type AchievementState = Achievement & { value: number; earned: boolean };

export function evaluate(trips: TripLike[], now: number): AchievementState[] {
  return ACHIEVEMENTS.map((a) => {
    const value = a.progress(trips, now);
    return { ...a, value: Math.min(value, a.goal), earned: value >= a.goal };
  });
}
