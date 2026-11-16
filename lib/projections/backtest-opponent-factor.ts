/**
 * Pure helpers for the opponent-factor backtest (see
 * openspec/changes/backtest-opponent-factor-methodology). Reuses
 * `computeOpponentFactors` unchanged — the only thing that varies between
 * variants is which historical entries are passed in. No database access
 * here; wiring to the DB lives in
 * scripts/backtest-opponent-factor-methodology.ts.
 */
import { computeOpponentFactors, type AllowedStatRow } from "./opponent-factor";
import { extractStatValue, type RawPlayerGameRow } from "./extract-prop-stat";
import type { PropStatType } from "../espn/prop-types";

/** One team's side of one game — `opponentRow` is the *other* team's box
 * score in that same game, since what a team "allows" is what its
 * opponent put up. */
export interface TeamAllowedEntry {
  gameId: number;
  date: Date;
  seasonId: number;
  teamId: number;
  opponentRow: RawPlayerGameRow;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildAllowedStatRows(entries: TeamAllowedEntry[], statType: PropStatType): AllowedStatRow[] {
  return entries.map((entry) => ({
    teamId: entry.teamId,
    allowedValue: extractStatValue(statType, entry.opponentRow),
  }));
}

export function leagueAverageAllowed(entries: TeamAllowedEntry[], statType: PropStatType): number | null {
  return average(entries.map((entry) => extractStatValue(statType, entry.opponentRow)));
}

export interface OpponentPrediction {
  factors: Map<number, number>;
  leagueAverage: number | null;
}

/** Computed once per (cutoff, statType, variant) — O(entries.length) via
 * the unmodified `computeOpponentFactors` — then looked up per team in
 * O(1) via `predictedAllowedValue` below, so grading many teams at the
 * same cutoff doesn't repeat this work per team. */
export function computeOpponentPrediction(
  entries: TeamAllowedEntry[],
  statType: PropStatType,
): OpponentPrediction {
  const leagueAverage = leagueAverageAllowed(entries, statType);
  const factors = leagueAverage === null ? new Map<number, number>() : computeOpponentFactors(buildAllowedStatRows(entries, statType));
  return { factors, leagueAverage };
}

/** `null` when there's no history yet to predict from — never fabricates
 * a value, matching the rest of this codebase's projection conventions. */
export function predictedAllowedValue(prediction: OpponentPrediction, teamId: number): number | null {
  if (prediction.leagueAverage === null) return null;
  const factor = prediction.factors.get(teamId) ?? 1;
  return factor * prediction.leagueAverage;
}

/** Season-progress buckets per design.md: how many of the team's current-
 * season games have already been played as of the game being predicted —
 * not counting that game itself. */
export const SEASON_PROGRESS_BUCKETS = [
  { label: "0-4", maxGamesPlayed: 4 },
  { label: "5-14", maxGamesPlayed: 14 },
  { label: "15+", maxGamesPlayed: Infinity },
] as const;

export function seasonProgressBucket(gamesPlayedSoFar: number): string {
  for (const bucket of SEASON_PROGRESS_BUCKETS) {
    if (gamesPlayedSoFar <= bucket.maxGamesPlayed) return bucket.label;
  }
  return SEASON_PROGRESS_BUCKETS[SEASON_PROGRESS_BUCKETS.length - 1].label;
}
