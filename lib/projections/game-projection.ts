/**
 * v2 projection methodology (improve-game-rating-model design.md
 * "Projected score: same output shape as today, different inputs"): each
 * team's offense/defense input is an opponent-adjusted rating (see
 * team-rating.ts), recency/season-blended, falling back to the v1
 * recency-weighted raw-PPG blend when a rating isn't supplied (e.g. too
 * little league-wide data for the solve to be meaningful yet). Home-court
 * edge is unchanged from v1. Deliberately simple and inspectable — no ML.
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

export interface UnavailableScorer {
  /** Per-game points for this player, most-recent window (same source as
   * the team's own `recentGames`), oldest first. */
  recentPoints: number[];
}

export interface TeamProjectionInput {
  seasonStat: TeamSeasonSummary | null;
  recentGames: TeamRecentGame[];
  /** Rostered players frozen OUT for this game (see
   * player-availability-tracking capability). Each qualifying scorer's
   * recent average is subtracted from this team's offense input, scaled
   * by `REDISTRIBUTION_LOSS_FACTOR`, instead of leaving the team's offense
   * as if he were available. Omit or leave empty when no one is OUT. */
  unavailableScorers?: UnavailableScorer[];
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
// How much weight recent form gets once there's enough of it.
const RECENT_FORM_WEIGHT = 0.6;
// Commonly-cited NBA home-court edge in points, used only when a team's
// own recent home/away split can't be computed.
const DEFAULT_HOME_COURT_EDGE = 2.0;

// Fraction of an OUT scorer's recent per-game points his team actually
// loses from its offense — the rest is assumed recovered through increased
// teammate usage. A flat placeholder constant (design.md "Team offense
// adjustment"), not a fitted or per-team value — revisit once graded
// evidence with/without this adjustment exists.
const REDISTRIBUTION_LOSS_FACTOR = 0.7;
// A player below this share of his team's own recent scoring isn't a
// "real contributor" for this adjustment's purposes — a deep bench player
// going OUT doesn't move the team offense input.
const MIN_SCORING_SHARE_FOR_ADJUSTMENT = 0.12;

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

function homeCourtEdge(home: TeamProjectionInput, away: TeamProjectionInput): number {
  const homeOwnEdge = splitHomeAwayMargin(home.recentGames);
  const awayOwnEdge = splitHomeAwayMargin(away.recentGames);
  if (homeOwnEdge !== null && awayOwnEdge !== null) return (homeOwnEdge + awayOwnEdge) / 2;
  return DEFAULT_HOME_COURT_EDGE;
}

/** A team's own "home games play better than away games" tendency, in
 * points, from its recent game log — null if it hasn't played enough of
 * both to say. */
function splitHomeAwayMargin(recentGames: TeamRecentGame[]): number | null {
  const homeMargins = recentGames.filter((g) => g.isHome).map((g) => g.pointsFor - g.pointsAgainst);
  const awayMargins = recentGames.filter((g) => !g.isHome).map((g) => g.pointsFor - g.pointsAgainst);
  const homeAvg = average(homeMargins);
  const awayAvg = average(awayMargins);
  if (homeAvg === null || awayAvg === null) return null;
  return (homeAvg - awayAvg) / 2;
}

/** How much to subtract from a team's blended offense for its OUT
 * scorers — 0 when no one is OUT or no qualifying scorer clears the
 * meaningful-share threshold. `teamOffense` is the team's own blended
 * offense (pre-adjustment), used as the denominator for "share of this
 * team's scoring." */
function unavailableScoringLoss(scorers: UnavailableScorer[] | undefined, teamOffense: number): number {
  if (!scorers || scorers.length === 0 || teamOffense <= 0) return 0;
  let loss = 0;
  for (const scorer of scorers) {
    if (scorer.recentPoints.length < MIN_RECENT_GAMES_FOR_BLEND) continue;
    const avg = average(scorer.recentPoints);
    if (avg === null || avg / teamOffense < MIN_SCORING_SHARE_FOR_ADJUSTMENT) continue;
    loss += avg * REDISTRIBUTION_LOSS_FACTOR;
  }
  return loss;
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

  const homeOffAdjusted = Math.max(0, homeOff - unavailableScoringLoss(home.unavailableScorers, homeOff));
  const awayOffAdjusted = Math.max(0, awayOff - unavailableScoringLoss(away.unavailableScorers, awayOff));

  const edge = homeCourtEdge(home, away);
  const projectedHomeScore = (homeOffAdjusted + awayDef) / 2 + edge / 2;
  const projectedAwayScore = (awayOffAdjusted + homeDef) / 2 - edge / 2;

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedMargin: projectedHomeScore - projectedAwayScore,
  };
}
