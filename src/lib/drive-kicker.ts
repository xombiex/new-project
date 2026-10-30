/** The line above the speedometer when you're parked: a small nudge that knows what day it is. */
export function driveKicker(when: Date): string {
  const day = when.getDay(); // 0 = Sunday
  const hour = when.getHours();
  if (hour < 5) return 'Empty roads. Good hour.';
  if (day === 6 && hour < 12) return 'Cars & coffee?';
  if (day === 0 && hour < 17) return 'Sunday drive?';
  if ((day === 5 || day === 6) && hour >= 17) return 'Night cruise?';
  if (hour >= 21) return 'One more lap of town?';
  if (hour >= 17) return 'Taking the long way home?';
  if (hour < 10) return 'Morning. Keys in hand?';
  return 'Where to today?';
}
