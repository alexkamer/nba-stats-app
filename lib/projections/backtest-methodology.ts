/**
 * Pure helpers for the projection-methodology backtest (see
 * openspec/changes/backtest-projection-methodology). Isolates the one
 * thing that differs between methodology variants — how a player's
 * "season average" input is derived from their game-log history — so each
 * variant can be fed through the existing, unmodified `projectPlayerStat`.
 * No database access here; wiring to the DB lives in
 * scripts/backtest-projection-methodology.ts.
 */
import { extractStatValue, type RawPlayerGameRow } from "./extract-prop-stat";
import type { PropStatType } from "../espn/prop-types";

/** Matches ingest/generate-projections.ts's RECENT_GAMES_WINDOW — the
 * recency window is not the thing under test, so both variants use the
 * same one the live pipeline already uses. */
export const RECENT_GAMES_WINDOW = 10;

export interface BacktestLogEntry {
  gameId: number;
  date: Date;
  seasonId: number;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  threeMade: number | null;
  steals: number | null;
  blocks: number | null;
  minutes: number | null;
}

export interface MethodologyVariantInputs {
  seasonAverage: number | null;
  recentValues: number[];
  recentMinutes: number[];
}

/** `log` must already be sorted ascending by date; `targetIndex` is the
 * game being projected — only entries before it may ever be read. */
export type MethodologyVariant = (
  log: BacktestLogEntry[],
  targetIndex: number,
  statType: PropStatType,
) => MethodologyVariantInputs;

function toRawRow(entry: BacktestLogEntry): RawPlayerGameRow {
  return {
    points: entry.points,
    rebounds: entry.rebounds,
    assists: entry.assists,
    threeMade: entry.threeMade,
    steals: entry.steals,
    blocks: entry.blocks,
    minutes: entry.minutes,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Today's live (buggy) behavior: season average drawn from every prior
 * game log entry regardless of season. */
export function unscopedVariant(
  log: BacktestLogEntry[],
  targetIndex: number,
  statType: PropStatType,
): MethodologyVariantInputs {
  const priorEntries = log.slice(0, targetIndex);
  const values = priorEntries.map((entry) => extractStatValue(statType, toRawRow(entry)));
  return {
    seasonAverage: average(values),
    recentValues: values.slice(-RECENT_GAMES_WINDOW),
    recentMinutes: priorEntries.slice(-RECENT_GAMES_WINDOW).map((entry) => entry.minutes ?? 0),
  };
}

/** Proposed fix: season average drawn only from entries in the same
 * season as the game being projected. Recency window is left unscoped,
 * matching the live pipeline's already-correct recent-form behavior. */
export function seasonScopedVariant(
  log: BacktestLogEntry[],
  targetIndex: number,
  statType: PropStatType,
): MethodologyVariantInputs {
  const targetSeasonId = log[targetIndex].seasonId;
  const priorEntries = log.slice(0, targetIndex);
  const values = priorEntries.map((entry) => extractStatValue(statType, toRawRow(entry)));
  const seasonValues = priorEntries
    .filter((entry) => entry.seasonId === targetSeasonId)
    .map((entry) => extractStatValue(statType, toRawRow(entry)));
  return {
    seasonAverage: average(seasonValues),
    recentValues: values.slice(-RECENT_GAMES_WINDOW),
    recentMinutes: priorEntries.slice(-RECENT_GAMES_WINDOW).map((entry) => entry.minutes ?? 0),
  };
}

export const METHODOLOGY_VARIANTS: Record<string, MethodologyVariant> = {
  unscoped: unscopedVariant,
  seasonScoped: seasonScopedVariant,
};

/** "Veteran" per design.md: has at least one logged game from a season
 * other than the one being projected, among entries before `targetIndex`.
 * Because `log` is chronologically sorted and a season's games never
 * interleave with another season's, any earlier entry with a different
 * `seasonId` is necessarily from an earlier season. */
export function hasPriorSeasonHistory(log: BacktestLogEntry[], targetIndex: number): boolean {
  const targetSeasonId = log[targetIndex].seasonId;
  for (let i = 0; i < targetIndex; i++) {
    if (log[i].seasonId !== targetSeasonId) return true;
  }
  return false;
}

export interface ErrorAccumulator {
  n: number;
  sumAbsError: number;
  sumSignedError: number;
}

export function createErrorAccumulator(): ErrorAccumulator {
  return { n: 0, sumAbsError: 0, sumSignedError: 0 };
}

export function addError(acc: ErrorAccumulator, projected: number, actual: number): void {
  acc.n += 1;
  acc.sumAbsError += Math.abs(projected - actual);
  acc.sumSignedError += projected - actual;
}

export function meanAbsoluteError(acc: ErrorAccumulator): number | null {
  return acc.n > 0 ? acc.sumAbsError / acc.n : null;
}

export function meanSignedError(acc: ErrorAccumulator): number | null {
  return acc.n > 0 ? acc.sumSignedError / acc.n : null;
}
