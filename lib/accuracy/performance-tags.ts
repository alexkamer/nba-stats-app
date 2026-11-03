/**
 * Derives deterministic reason tags for a team's game from already-ingested
 * facts (team-game-performance-tracking). Pure — callers pre-fetch the score
 * timeline, availability and shooting figures and pass them in; see
 * ingest/compute-team-game-performance.ts for the DB-facing side. Every rule
 * is omitted (never guessed) when the data it depends on is absent, so
 * missing play-by-play or availability can't produce a wrong tag.
 */

export type PerformanceTag =
  | "STAR_OUT"
  | "EARLY_BLOWOUT"
  | "LATE_COLLAPSE"
  | "GARBAGE_TIME_SWING"
  | "SHOOTING_HOT"
  | "SHOOTING_COLD";

/** |margin| at the end of the 2nd period at or beyond which a game is an early blowout. */
export const EARLY_BLOWOUT_MARGIN = 20;
/** Lead (points) a team must have held at some point to count as having collapsed if it then lost.
 * Tuned against the dev database: a 10-point lead followed by a loss happens in
 * ~14% of team-games (too common to be notable); 15 narrows it to ~5%. */
export const LATE_COLLAPSE_LEAD = 15;
/** |margin| entering the 4th period at or beyond which a cover flip counts as a garbage-time swing. */
export const GARBAGE_TIME_MARGIN = 15;
/** Deviation of game FG% from the team's season-to-date FG% (as a fraction, 0.06 = 6 points) that counts as hot/cold shooting. */
export const SHOOTING_DEVIATION = 0.06;
/** How many of a team's top players by minutes count as "stars" for STAR_OUT. */
export const STAR_COUNT = 3;

/** One point in the game's score timeline, from the tagged team's perspective. */
export interface TimelinePoint {
  period: number;
  /** Team's score minus opponent's score after this play. */
  margin: number;
}

export interface TagInput {
  /** Chronological score timeline, or null/empty when no play-by-play exists. */
  timeline: TimelinePoint[] | null;
  /** Margin the line implied for the team (positive = favored). */
  expectedMargin: number;
  /** Team's final margin (score minus opponent's). */
  finalMargin: number;
  /** Whether one of the team's top players by minutes was listed OUT; null = availability unknown for this game. */
  starOut: boolean | null;
  /** The team's FG% in this game as a fraction, or null when unavailable. */
  gameFgPct: number | null;
  /** The team's FG% over its earlier games this season as a fraction, or null when unavailable. */
  seasonFgPct: number | null;
}

/** Margin after the last play in or before `period`, or null if there is none. */
export function marginAtEndOfPeriod(timeline: TimelinePoint[], period: number): number | null {
  let result: number | null = null;
  for (const point of timeline) {
    if (point.period <= period) result = point.margin;
    else break;
  }
  return result;
}

export function deriveTags(input: TagInput): PerformanceTag[] {
  const tags: PerformanceTag[] = [];
  const { timeline, expectedMargin, finalMargin } = input;

  if (input.starOut === true) tags.push("STAR_OUT");

  if (timeline && timeline.length > 0) {
    const atHalf = marginAtEndOfPeriod(timeline, 2);
    if (atHalf !== null && Math.abs(atHalf) >= EARLY_BLOWOUT_MARGIN) tags.push("EARLY_BLOWOUT");

    const maxLead = timeline.reduce((max, p) => Math.max(max, p.margin), 0);
    if (maxLead >= LATE_COLLAPSE_LEAD && finalMargin < 0) tags.push("LATE_COLLAPSE");

    // Entering the 4th = margin after the last play of the 3rd period. Only
    // meaningful when the game actually reached a 4th period.
    const reachedFourth = timeline.some((p) => p.period >= 4);
    const afterThird = reachedFourth ? marginAtEndOfPeriod(timeline, 3) : null;
    if (afterThird !== null && Math.abs(afterThird) >= GARBAGE_TIME_MARGIN) {
      const coverThen = afterThird - expectedMargin;
      const coverFinal = finalMargin - expectedMargin;
      if (coverThen * coverFinal < 0) tags.push("GARBAGE_TIME_SWING");
    }
  }

  if (input.gameFgPct !== null && input.seasonFgPct !== null) {
    const delta = input.gameFgPct - input.seasonFgPct;
    if (delta >= SHOOTING_DEVIATION) tags.push("SHOOTING_HOT");
    else if (delta <= -SHOOTING_DEVIATION) tags.push("SHOOTING_COLD");
  }

  return tags;
}
