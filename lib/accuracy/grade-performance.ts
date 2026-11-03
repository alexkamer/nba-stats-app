/**
 * Measures how a team performed against the market's expectation in a single
 * game (team-game-performance-tracking). Where `grade-cover.ts` answers
 * "did the team cover?" with a discrete COVER / NO_COVER / PUSH, this answers
 * "by how much?" with a signed margin. Pure — callers supply the recorded
 * line and the actual scores; see ingest/compute-team-game-performance.ts
 * for the DB-facing side.
 *
 * Conventions mirror `gradeAtsCover`: `spread` is home-team-relative and
 * favorite-negative (same as `Odds.spread`), so the home team's expected
 * margin is `-spread`. cover margin > 0 iff the team covered, = 0 iff push.
 */

export type PerformanceLabel = "STRONG_OVER" | "OVER" | "AS_EXPECTED" | "UNDER" | "STRONG_UNDER";

/** Cover margin (points) at or beyond which a game is "strongly" over/under.
 * Tuned against the dev database: cover margins have a standard deviation of
 * ~12.6 points, so +/-15 flags roughly the top and bottom ~11% of team-games. */
export const STRONG_THRESHOLD = 15;
/** Cover margin (points) within which a game is "as expected" (about a
 * third of all games). */
export const AS_EXPECTED_BAND = 5;
/** Season-average cover margin beyond which a team is labeled over/under
 * for the season. Much tighter than the per-game bands, since an average
 * over many games moves far less than a single result (about one standard
 * error for a full 82-game season). */
export const SEASON_AVERAGE_BAND = 1.5;

export interface TeamMargins {
  /** Margin the line implies for this team: positive when favored. */
  expectedMargin: number;
  /** Team's final score minus its opponent's. */
  actualMargin: number;
  /** actualMargin - expectedMargin: positive = beat expectation. */
  coverMargin: number;
}

export interface GameMargins {
  home: TeamMargins;
  away: TeamMargins;
}

/** Normalizes -0 to 0 so a pick'em or exact-push never serializes as "-0". */
function clean(n: number): number {
  return n === 0 ? 0 : n;
}

/** Computes both teams' expected, actual and cover margins for one game.
 * The two teams' cover margins are equal in magnitude and opposite in sign. */
export function computeMargins(spread: number, homeScore: number, awayScore: number): GameMargins {
  const homeActual = homeScore - awayScore;
  const homeExpected = -spread;
  const homeCover = homeActual - homeExpected;
  return {
    home: {
      expectedMargin: clean(homeExpected),
      actualMargin: clean(homeActual),
      coverMargin: clean(homeCover),
    },
    away: {
      expectedMargin: clean(-homeExpected),
      actualMargin: clean(-homeActual),
      coverMargin: clean(-homeCover),
    },
  };
}

/** Buckets a single game's cover margin. Independent of win/loss: a team can
 * lose and still be "as expected" or better, or win and be "strongly under". */
export function labelFor(coverMargin: number): PerformanceLabel {
  if (coverMargin >= STRONG_THRESHOLD) return "STRONG_OVER";
  if (coverMargin >= AS_EXPECTED_BAND) return "OVER";
  if (coverMargin <= -STRONG_THRESHOLD) return "STRONG_UNDER";
  if (coverMargin <= -AS_EXPECTED_BAND) return "UNDER";
  return "AS_EXPECTED";
}

/** Coarse three-way label for a season (or split) average cover margin. */
export function averageLabel(averageCoverMargin: number): "OVER" | "AS_EXPECTED" | "UNDER" {
  if (averageCoverMargin >= SEASON_AVERAGE_BAND) return "OVER";
  if (averageCoverMargin <= -SEASON_AVERAGE_BAND) return "UNDER";
  return "AS_EXPECTED";
}

/** Mean of a list of cover margins, or null when there are none — so an
 * empty split reads as "unavailable" rather than a misleading 0. */
export function averageCoverMargin(margins: number[]): number | null {
  if (margins.length === 0) return null;
  return margins.reduce((sum, m) => sum + m, 0) / margins.length;
}

/** Whether a team was the favorite, from its own expected margin: positive =
 * favorite, negative = underdog, zero (pick'em) = neither. */
export function favoriteFlag(expectedMargin: number): boolean | null {
  if (expectedMargin === 0) return null;
  return expectedMargin > 0;
}
