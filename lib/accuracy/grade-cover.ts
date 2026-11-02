/**
 * Grades a game's actual result against the market spread/total, for team
 * ATS and over/under record-keeping (team-cover-record-tracking). Pure —
 * callers supply the recorded line and the actual scores; see
 * ingest/compute-cover-records.ts for the DB-facing side.
 */

export type CoverResult = "COVER" | "NO_COVER" | "PUSH";
export type TotalResult = "OVER" | "UNDER" | "PUSH";

export interface AtsCoverResult {
  home: CoverResult;
  away: CoverResult;
}

/** Grades the home and away side against a recorded spread (home-team-
 * relative, favorite-negative — same convention as `Odds.spread`). The
 * home side covers when its actual margin beats the market's implied
 * margin (`-spread`); the away side's result mirrors it, except both push
 * together when the actual margin lands exactly on the line. */
export function gradeAtsCover(spread: number, homeScore: number, awayScore: number): AtsCoverResult {
  const actualMargin = homeScore - awayScore;
  const impliedHomeMargin = -spread;
  if (actualMargin === impliedHomeMargin) return { home: "PUSH", away: "PUSH" };
  const homeCovered = actualMargin > impliedHomeMargin;
  return {
    home: homeCovered ? "COVER" : "NO_COVER",
    away: homeCovered ? "NO_COVER" : "COVER",
  };
}

/** Grades the combined final score against a recorded over/under total.
 * The same result applies to both participating teams' over/under
 * records — "over" and "under" aren't per-team sides the way ATS is. */
export function gradeOverUnder(overUnder: number, homeScore: number, awayScore: number): TotalResult {
  const actualTotal = homeScore + awayScore;
  if (actualTotal === overUnder) return "PUSH";
  return actualTotal > overUnder ? "OVER" : "UNDER";
}

/** Rolls a team's current ATS or over/under streak forward by one more
 * graded result, applied in chronological order. Positive values count a
 * current winning (covering/over) streak, negative a current losing
 * (non-covering/under) streak; a push neither extends nor breaks it. */
export function nextStreak(currentStreak: number, outcome: "WIN" | "LOSS" | "PUSH"): number {
  if (outcome === "PUSH") return currentStreak;
  if (outcome === "WIN") return currentStreak >= 0 ? currentStreak + 1 : 1;
  return currentStreak <= 0 ? currentStreak - 1 : -1;
}
