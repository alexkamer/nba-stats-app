/**
 * v2 projection methodology (improve-game-rating-model design.md
 * "Projected score: same output shape as today, different inputs"): each
 * team's offense/defense input is an opponent-adjusted rating (see
 * team-rating.ts), recency/season-blended, falling back to the v1
 * recency-weighted raw-PPG blend when a rating isn't supplied (e.g. too
 * little league-wide data for the solve to be meaningful yet). Home-court
 * edge is a flat constant — the per-team dynamic split v1 used was
 * backtested and found to make projections worse, not better (see
 * HOME_COURT_EDGE below). Deliberately simple and inspectable — no ML.
 */
import type { TeamRating } from "./team-rating";

export interface TeamRecentGame {
  isHome: boolean;
  pointsFor: number;
  pointsAgainst: number;
}

export interface TeamSeasonSummary {
  pointsPerGame: number;
  oppPointsPerGame: number;
}

export interface TeamProjectionInput {
  seasonStat: TeamSeasonSummary | null;
  recentGames: TeamRecentGame[];
  /** Opponent-adjusted ratings for this team, solved league-wide (see
   * team-rating.ts) — recent-window and season-long, independently
   * converged. Omit, or pass `null` for either window, to fall back to
   * the plain recency/season PPG blend for that window (design.md
   * "Graceful degradation" — e.g. too little league-wide data for the
   * solve to be meaningful yet). Ignored unless `leagueAvgPoints` is also
   * provided. */
  rating?: { recent: TeamRating | null; season: TeamRating | null } | null;
  /** League average points per game at solve time, needed to convert a
   * relative rating back into absolute points. Ignored when `rating` is
   * omitted. */
  leagueAvgPoints?: number;
}

export interface GameProjectionResult {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedMargin: number; // home-team-relative, matching the Odds model's convention
}

// Below this many recent games, the recent-form sample is too noisy to
// blend in — fall back to season averages alone.
const MIN_RECENT_GAMES_FOR_BLEND = 3;
// How much weight recent form gets once there's enough of it. Swept
// against 3 completed seasons (scripts/sweep-game-hyperparameters.ts,
// --param=recentFormWeight) — 0.6 is already within 0.01 MAE of the
// best value found (0.5-0.6), not worth changing.
const RECENT_FORM_WEIGHT = 0.6;
// Flat NBA home-court edge in points, applied to every game. A team's own
// recent home/away scoring split used to be tried first, falling back to
// a flat default only when it couldn't be computed — swept against 3
// completed seasons (scripts/sweep-game-hyperparameters.ts,
// --param=homeCourtEdge) and rejected: the per-team split made
// projections worse than just using this flat constant for every game —
// margin MAE 11.75 vs 11.47, winner accuracy 62.8% vs 66.3%, consistent
// across all 3 seasons individually. A ~5-home/~5-away split from a
// 10-game recent window is too small a sample to carry useful signal; it
// was adding noise, not signal.
const HOME_COURT_EDGE = 1.8;

// There used to be an "unavailable scorer" adjustment here — subtracting a
// frozen-OUT player's recent scoring average (times a flat 0.7
// redistribution-loss factor) from his team's offense input. It shipped as
// an acknowledged unvalidated placeholder and was removed once validated:
// a proxy backtest (scripts/backtest-redistribution-loss-factor.ts — no
// scorer missing a box score he'd normally appear in, standing in for
// frozen-OUT, since there's no historical PlayerAvailability snapshot to
// replay) found NBA teams recover a missing scorer's offense almost
// completely on average. Team-offense MAE was lowest with NO adjustment at
// all (10.0) and got monotonically worse at every tested factor up to 1.0
// (31.7) — holding across every missing-scorer-magnitude bucket, not just
// marginal ones, n=4040. The market-moneyline framing of "a star being out
// swings the line a lot" doesn't carry over to predicting raw team points.

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function blend(seasonValue: number | null, recentValues: number[]): number | null {
  const recentAvg = average(recentValues);
  if (recentAvg !== null && recentValues.length >= MIN_RECENT_GAMES_FOR_BLEND) {
    return seasonValue !== null ? RECENT_FORM_WEIGHT * recentAvg + (1 - RECENT_FORM_WEIGHT) * seasonValue : recentAvg;
  }
  return seasonValue;
}

/** Blends a team's season and recent-window ratings 60/40, same
 * `RECENT_FORM_WEIGHT`/qualifying-bar convention as `blend()` — below the
 * bar, or with no recent rating, falls back to the season rating alone.
 * Exported so `ingest/generate-projections.ts` can reuse the exact same
 * blend for its residual-based stdev backtest (design.md "Residual-based
 * stdev"), rather than duplicating this logic. */
export function blendRating(
  seasonRating: TeamRating | null | undefined,
  recentRating: TeamRating | null | undefined,
  recentGameCount: number,
): TeamRating | null {
  if (recentRating && recentGameCount >= MIN_RECENT_GAMES_FOR_BLEND) {
    if (!seasonRating) return recentRating;
    return {
      offRating: RECENT_FORM_WEIGHT * recentRating.offRating + (1 - RECENT_FORM_WEIGHT) * seasonRating.offRating,
      defRating: RECENT_FORM_WEIGHT * recentRating.defRating + (1 - RECENT_FORM_WEIGHT) * seasonRating.defRating,
    };
  }
  return seasonRating ?? null;
}

/** Converts a team's blended rating into absolute offense/defense points,
 * or `null` when no rating is available (or `leagueAvgPoints` is
 * missing) so the caller falls back to the raw PPG blend instead. */
function offenseDefenseFromRating(input: TeamProjectionInput): { offense: number; defense: number } | null {
  if (!input.rating || input.leagueAvgPoints === undefined) return null;
  const blended = blendRating(input.rating.season, input.rating.recent, input.recentGames.length);
  if (!blended) return null;
  return { offense: input.leagueAvgPoints + blended.offRating, defense: input.leagueAvgPoints + blended.defRating };
}

/** Returns `null` when either team lacks qualifying history (no season
 * stat and no recent games) — never fabricates a projection. */
export function projectGame(home: TeamProjectionInput, away: TeamProjectionInput): GameProjectionResult | null {
  const homeRating = offenseDefenseFromRating(home);
  const awayRating = offenseDefenseFromRating(away);

  const homeOff = homeRating?.offense ?? blend(home.seasonStat?.pointsPerGame ?? null, home.recentGames.map((g) => g.pointsFor));
  const homeDef = homeRating?.defense ?? blend(home.seasonStat?.oppPointsPerGame ?? null, home.recentGames.map((g) => g.pointsAgainst));
  const awayOff = awayRating?.offense ?? blend(away.seasonStat?.pointsPerGame ?? null, away.recentGames.map((g) => g.pointsFor));
  const awayDef = awayRating?.defense ?? blend(away.seasonStat?.oppPointsPerGame ?? null, away.recentGames.map((g) => g.pointsAgainst));

  if (homeOff === null || homeDef === null || awayOff === null || awayDef === null) return null;

  const projectedHomeScore = (homeOff + awayDef) / 2 + HOME_COURT_EDGE / 2;
  const projectedAwayScore = (awayOff + homeDef) / 2 - HOME_COURT_EDGE / 2;

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedMargin: projectedHomeScore - projectedAwayScore,
  };
}
