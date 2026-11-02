/**
 * Grades a frozen game-level prediction against a game's final result.
 * Pure — callers supply the frozen prediction and the actual scores; see
 * ingest/grade-predictions.ts for the DB-facing side.
 */

export interface GameGradeResult {
  correct: boolean;
  marginError: number;
}

/** Grades our own `GameProjection` (a home-team-relative margin) against
 * the actual final scores. */
export function gradeGameProjection(
  projectedMargin: number,
  actualHomeScore: number,
  actualAwayScore: number,
): GameGradeResult {
  const actualMargin = actualHomeScore - actualAwayScore;
  return {
    correct: Math.sign(projectedMargin) === Math.sign(actualMargin),
    marginError: Math.abs(projectedMargin - actualMargin),
  };
}

export interface CoverGradeResult {
  /** `null` for a push — either our own pick or the actual result landed
   * exactly on the market line, so there's no side to grade. */
  correct: boolean | null;
}

/** Grades the spread side our projection favors (home if our margin beats
 * the market's implied margin, away otherwise — see the betting-insights
 * page's "Our pick" row) against whether that side actually covered. */
export function gradeSpreadCoverage(
  projectedMargin: number,
  marketMargin: number | null,
  actualMargin: number,
): CoverGradeResult {
  if (marketMargin === null || projectedMargin === marketMargin || actualMargin === marketMargin) {
    return { correct: null };
  }
  const pickedHome = projectedMargin > marketMargin;
  const homeCovered = actualMargin > marketMargin;
  return { correct: pickedHome === homeCovered };
}

/** Same idea as `gradeSpreadCoverage`, for the total/over-under pick. */
export function gradeTotalCoverage(
  projectedTotal: number,
  marketTotal: number | null,
  actualTotal: number,
): CoverGradeResult {
  if (marketTotal === null || projectedTotal === marketTotal || actualTotal === marketTotal) {
    return { correct: null };
  }
  const pickedOver = projectedTotal > marketTotal;
  const wentOver = actualTotal > marketTotal;
  return { correct: pickedOver === wentOver };
}

export interface MarketFavoriteGradeResult {
  /** `null` when there's no market line recorded at pick time, or the
   * market had no favorite (a pick'em, `marketMarginAtPick === 0`) — no
   * side to grade either way. */
  correct: boolean | null;
}

/** Grades "always pick the market's favored side" (straight-up) against
 * the actual winner — a baseline distinct from our own model and ESPN's
 * predictor, since a sportsbook line is calibrated against the spread, not
 * against who wins outright (see improve-game-rating-model design.md
 * "Market-favorite accuracy baseline"). `marketMarginAtPick` is the
 * frozen home-relative implied margin already stored on `GameProjection`
 * (positive means home favored). */
export function gradeMarketFavorite(
  marketMarginAtPick: number | null,
  actualHomeScore: number,
  actualAwayScore: number,
): MarketFavoriteGradeResult {
  if (marketMarginAtPick === null || marketMarginAtPick === 0) return { correct: null };
  const homeFavored = marketMarginAtPick > 0;
  const homeWon = actualHomeScore > actualAwayScore;
  return { correct: homeFavored === homeWon };
}

/** Grades a snapshotted ESPN `predictor` (win probabilities, not a score
 * margin — see ingest/mappers/predictor.ts). `marginError` is repurposed
 * here as a probability-error proxy: how far the actual winner's
 * predicted win percentage was from full confidence (0 = predicted that
 * winner at 100%, higher = more "surprised" by the actual result). */
export function gradePredictorSnapshot(
  homeWinPct: number,
  awayWinPct: number,
  actualHomeScore: number,
  actualAwayScore: number,
): GameGradeResult {
  const homeWon = actualHomeScore > actualAwayScore;
  const predictedHomeWin = homeWinPct > awayWinPct;
  const winnerPredictedPct = homeWon ? homeWinPct : awayWinPct;
  return {
    correct: predictedHomeWin === homeWon,
    marginError: 100 - winnerPredictedPct,
  };
}
