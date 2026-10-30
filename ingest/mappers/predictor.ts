/**
 * Shape confirmed against `summary`'s `predictor` field. Despite the name,
 * `gameProjection` is a win-probability percentage (home + away always sum
 * to ~100), not a projected score — confirmed by direct probing; ESPN
 * exposes no projected-score field here. Also confirmed empty once a game
 * reaches FINAL, so this must be captured while the game is still
 * scheduled (see betting-odds-ingest capability).
 */
export interface EspnPredictorEntry {
  homeTeam: { id: string; gameProjection: string };
  awayTeam: { id: string; gameProjection: string };
}

export interface PredictorSnapshotUpsertInput {
  gameId: number;
  homeWinPct: number;
  awayWinPct: number;
  capturedAt: Date;
}

/** Returns `null` when `predictor` is absent or malformed, rather than
 * fabricating a snapshot. */
export function mapPredictor(
  predictor: EspnPredictorEntry | undefined,
  gameId: number,
): PredictorSnapshotUpsertInput | null {
  if (!predictor?.homeTeam || !predictor?.awayTeam) return null;
  const homeWinPct = Number.parseFloat(predictor.homeTeam.gameProjection);
  const awayWinPct = Number.parseFloat(predictor.awayTeam.gameProjection);
  if (!Number.isFinite(homeWinPct) || !Number.isFinite(awayWinPct)) return null;

  return {
    gameId,
    homeWinPct,
    awayWinPct,
    capturedAt: new Date(),
  };
}
