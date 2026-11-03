/**
 * Rolls a team's per-game performance rows up into the season summary and
 * splits shown on the team Performance tab (team-performance-views). Pure —
 * the API route supplies the persisted rows. Any split with no games is
 * `null` (displayed as unavailable) rather than 0.
 */
import { averageCoverMargin, averageLabel } from "./grade-performance";

/** Number of most recent graded games in the "last 10" split. */
export const LAST_N_GAMES = 10;

export interface SummaryRow {
  /** Used only to order the rows chronologically for the last-N split. */
  date: Date;
  coverMargin: number;
  /** null for a pick'em, which belongs to neither the favorite nor underdog split. */
  isFavorite: boolean | null;
  isHome: boolean;
}

export interface SplitAverage {
  average: number | null;
  games: number;
}

export interface PerformanceSummary {
  games: number;
  seasonAverage: number | null;
  seasonLabel: "OVER" | "AS_EXPECTED" | "UNDER" | null;
  lastTen: SplitAverage;
  asFavorite: SplitAverage;
  asUnderdog: SplitAverage;
  home: SplitAverage;
  away: SplitAverage;
}

function split(rows: SummaryRow[]): SplitAverage {
  return { average: averageCoverMargin(rows.map((r) => r.coverMargin)), games: rows.length };
}

export interface SeasonTrendRow {
  year: number;
  coverMargin: number;
}

export interface SeasonTrendEntry {
  year: number;
  averageCoverMargin: number;
  label: "OVER" | "AS_EXPECTED" | "UNDER";
  games: number;
}

/** Rolls a team's performance rows up into one entry per season with at
 * least one graded game, ascending by year — for the Performance tab's
 * season-over-season trend section (independent of whichever single season
 * the rest of the tab is showing). */
export function summarizeSeasonTrend(rows: SeasonTrendRow[]): SeasonTrendEntry[] {
  const byYear = new Map<number, number[]>();
  for (const row of rows) {
    const margins = byYear.get(row.year) ?? [];
    margins.push(row.coverMargin);
    byYear.set(row.year, margins);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, margins]) => {
      const average = averageCoverMargin(margins)!;
      return { year, averageCoverMargin: average, label: averageLabel(average), games: margins.length };
    });
}

export function summarizePerformance(rows: SummaryRow[]): PerformanceSummary {
  const chronological = rows.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
  const seasonAverage = averageCoverMargin(chronological.map((r) => r.coverMargin));
  return {
    games: chronological.length,
    seasonAverage,
    seasonLabel: seasonAverage === null ? null : averageLabel(seasonAverage),
    lastTen: split(chronological.slice(-LAST_N_GAMES)),
    asFavorite: split(chronological.filter((r) => r.isFavorite === true)),
    asUnderdog: split(chronological.filter((r) => r.isFavorite === false)),
    home: split(chronological.filter((r) => r.isHome)),
    away: split(chronological.filter((r) => !r.isHome)),
  };
}
