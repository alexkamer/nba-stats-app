/**
 * Local-calendar-day key helpers for the Baseline Briefing page — same
 * "server process's local `new Date()`" convention the Best Bets day key
 * already uses (see src/app/api/betting/upcoming/route.ts), so briefing
 * dates line up with the same days DailyBestBet/DailyStatLeader are keyed
 * under.
 */

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `null` for a malformed key rather than throwing, so callers can turn an
 * invalid `?date=` or route param into a 400 instead of a crash. */
export function parseDateKey(key: string): Date | null {
  const match = DATE_KEY_RE.exec(key);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Reject e.g. 2026-02-30 — Date silently rolls it into March 2nd.
  if (toDateKey(date) !== key) return null;
  return date;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function shiftDateKey(key: string, deltaDays: number): string | null {
  const date = parseDateKey(key);
  if (!date) return null;
  date.setDate(date.getDate() + deltaDays);
  return toDateKey(date);
}

export function isFutureKey(key: string): boolean {
  return key > todayKey();
}
