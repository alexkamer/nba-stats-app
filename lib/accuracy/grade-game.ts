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
