export function formatAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString();
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "May 31st", or "May 31st, 2025" outside the current year. */
export function formatDayOrdinal(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const month = d.toLocaleDateString([], { month: 'long' });
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `, ${d.getFullYear()}` : '';
  return `${month} ${ordinal(d.getDate())}${year}`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
