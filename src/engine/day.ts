// A "day" is a local calendar date that starts at the player's boundary hour (default 04:00),
// so a session at 01:30 still counts toward the previous day.

export type DayKey = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(now: Date, boundaryHour: number): DayKey {
  const d = new Date(now.getTime() - boundaryHour * 3600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(k: DayKey): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = parse(k);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
}

/** The instant the given day ends (the next day's boundary). */
export function dayEnd(k: DayKey, boundaryHour: number): Date {
  const d = parse(addDays(k, 1));
  d.setHours(boundaryHour, 0, 0, 0);
  return d;
}
