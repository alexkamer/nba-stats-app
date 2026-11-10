/**
 * Flags players with a live Over player-prop pick who are clearing a
 * notable stat threshold consistently (see player-prop-streak-tracking
 * capability). Each eligible stat type (besides DOUBLE_DOUBLE) has a ladder
 * of thresholds; a player's entry reports the highest threshold on that
 * ladder they currently have a notable streak at.
 */

export const ELIGIBLE_STREAK_STAT_TYPES = [
  "POINTS",
  "REBOUNDS",
  "ASSISTS",
  "THREE_POINTERS_MADE",
  "POINTS_REBOUNDS_ASSISTS",
  "POINTS_REBOUNDS",
  "POINTS_ASSISTS",
  "REBOUNDS_ASSISTS",
  "DOUBLE_DOUBLE",
] as const;

export type EligibleStreakStatType = (typeof ELIGIBLE_STREAK_STAT_TYPES)[number];

/** Threshold ladders, ascending, for every eligible stat type except
 * DOUBLE_DOUBLE (which has no threshold — it's a per-game boolean). */
export const STREAK_STAT_THRESHOLDS: Record<Exclude<EligibleStreakStatType, "DOUBLE_DOUBLE">, number[]> = {
  POINTS: [10, 15, 20, 25, 30, 35, 40],
  ASSISTS: [3, 5, 7, 10, 13],
  REBOUNDS: [3, 5, 7, 10, 13, 15],
  THREE_POINTERS_MADE: [1, 2, 3, 4, 5, 6, 7],
  POINTS_REBOUNDS_ASSISTS: [15, 20, 25, 30, 35, 40, 45, 50, 55],
  POINTS_REBOUNDS: [10, 15, 20, 25, 30, 35, 40, 45],
  POINTS_ASSISTS: [10, 15, 20, 25, 30, 35, 40, 45],
  REBOUNDS_ASSISTS: [5, 7, 10, 13, 15, 17, 20],
};

// A streak this long or longer is worth calling out on its own, even
// without checking the hit-rate side of the "notable" bar.
const NOTABLE_STREAK_LENGTH = 3;

// The last-10-game hit-rate bar that makes a player notable even when
// their current consecutive streak fell short (e.g. one recent miss).
const NOTABLE_HIT_RATE = 0.9;

// How many of a player's most recent completed games the hit-rate side of
// "notable" is computed over.
const HIT_RATE_WINDOW = 10;

export function isEligibleStreakStatType(statType: string): statType is EligibleStreakStatType {
  return (ELIGIBLE_STREAK_STAT_TYPES as readonly string[]).includes(statType);
}

/** Number of most-recent consecutive games (first entry = most recent)
 * meeting or exceeding `floor`, stopping at the first miss. */
export function computeConsecutiveStreak(recentValuesMostRecentFirst: number[], floor: number): number {
  let streak = 0;
  for (const value of recentValuesMostRecentFirst) {
    if (value < floor) break;
    streak++;
  }
  return streak;
}

/** Fraction of the given games (at most `HIT_RATE_WINDOW`, fewer if that's
 * all that's available) meeting or exceeding `floor`. `null` with zero
 * games rather than dividing by zero. */
export function computeHitRate(recentValuesMostRecentFirst: number[], floor: number): number | null {
  const window = recentValuesMostRecentFirst.slice(0, HIT_RATE_WINDOW);
  if (window.length === 0) return null;
  const hits = window.filter((value) => value >= floor).length;
  return hits / window.length;
}

export interface PlayerStreakEvaluation {
  streak: number;
  hitRate: number | null;
  notable: boolean;
}

/** A player/stat pair is notable with either a 3+ game current streak, or
 * a last-10-game hit rate of 90%+ even if the current streak is shorter
 * (e.g. broken by one recent off night). */
export function evaluatePlayerStreak(recentValuesMostRecentFirst: number[], floor: number): PlayerStreakEvaluation {
  const streak = computeConsecutiveStreak(recentValuesMostRecentFirst, floor);
  const hitRate = computeHitRate(recentValuesMostRecentFirst, floor);
  const notable = streak >= NOTABLE_STREAK_LENGTH || (hitRate !== null && hitRate >= NOTABLE_HIT_RATE);
  return { streak, hitRate, notable };
}

export interface PlayerThresholdStreakEvaluation extends PlayerStreakEvaluation {
  threshold: number;
}

/** Walks `thresholds` (ascending) from the top down and returns the
 * evaluation for the highest one that's notable — e.g. a player notable at
 * both 10+ and 20+ points reports only the 20+ entry, since the lower one
 * is implied. `null` when no threshold on the ladder is notable. */
export function pickHighestNotableThreshold(
  recentValuesMostRecentFirst: number[],
  thresholds: number[],
): PlayerThresholdStreakEvaluation | null {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    const threshold = thresholds[i];
    const evaluation = evaluatePlayerStreak(recentValuesMostRecentFirst, threshold);
    if (evaluation.notable) return { threshold, ...evaluation };
  }
  return null;
}

/** Earliest date, at or after `today`, that appears in `datesWithEligibleOverProps`
 * — the "relevant date" the streak section evaluates. `null` when no such
 * date exists (nothing to show). Dates are compared by day, ignoring time. */
export function resolveRelevantDate(today: Date, datesWithEligibleOverProps: Date[]): Date | null {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const candidates = datesWithEligibleOverProps
    .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    .filter((d) => d >= todayStart)
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}
