/**
 * King of the Court — daily points+rebounds+assists leader computation
 * (see daily-stat-leader-tracking capability). Pure — callers supply a
 * day's `PlayerGameStat` rows; see ingest/compute-daily-stat-leaders.ts
 * for the DB-facing side.
 */
import { extractStatValue, type RawPlayerGameRow } from "./extract-prop-stat";

export interface DailyPlayerStatRow extends RawPlayerGameRow {
  playerId: number;
}

export interface DailyLeader {
  playerId: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
}

/** Whether a single game's box score qualifies as a triple-double — reuses
 * the same points/rebounds/assists/steals/blocks threshold the
 * TRIPLE_DOUBLE prop type already defines, so the two can never disagree. */
export function hasTripleDouble(row: RawPlayerGameRow): boolean {
  return extractStatValue("TRIPLE_DOUBLE", row) === 1;
}

/** Finds the player(s) with the day's highest combined points+rebounds+
 * assists total across one or more `PlayerGameStat` rows (already scoped
 * to a single calendar date's completed games by the caller). Returns
 * every player tied for the top total, and whether each recorded a
 * triple-double in their game that day. Returns an empty array when given
 * no rows. */
export function findDailyLeaders(rows: DailyPlayerStatRow[]): DailyLeader[] {
  if (rows.length === 0) return [];

  const totals = rows.map((row) => ({
    playerId: row.playerId,
    pointsReboundsAssists: (row.points ?? 0) + (row.rebounds ?? 0) + (row.assists ?? 0),
    hadTripleDouble: hasTripleDouble(row),
  }));

  const max = Math.max(...totals.map((t) => t.pointsReboundsAssists));
  return totals.filter((t) => t.pointsReboundsAssists === max);
}
