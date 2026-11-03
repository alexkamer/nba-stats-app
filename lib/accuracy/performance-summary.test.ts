import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizePerformance, summarizeSeasonTrend, LAST_N_GAMES, type SummaryRow, type SeasonTrendRow } from "./performance-summary";

function row(day: number, coverMargin: number, isFavorite: boolean | null, isHome: boolean): SummaryRow {
  return { date: new Date(Date.UTC(2026, 0, day)), coverMargin, isFavorite, isHome };
}

function seasonRow(year: number, coverMargin: number): SeasonTrendRow {
  return { year, coverMargin };
}

test("an empty season yields null averages and zero games, never 0", () => {
  const s = summarizePerformance([]);
  assert.equal(s.games, 0);
  assert.equal(s.seasonAverage, null);
  assert.equal(s.seasonLabel, null);
  assert.equal(s.lastTen.average, null);
  assert.equal(s.asUnderdog.average, null);
});

test("season average and label come from all rows", () => {
  const s = summarizePerformance([row(1, 4, true, true), row(2, 2, false, false), row(3, 0, true, false)]);
  assert.equal(s.games, 3);
  assert.equal(s.seasonAverage, 2);
  assert.equal(s.seasonLabel, "OVER");
});

test("favorite/underdog splits exclude pick'ems; home/away partition all rows", () => {
  const s = summarizePerformance([
    row(1, 10, true, true),
    row(2, -4, false, false),
    row(3, 6, null, true), // pick'em
    row(4, -2, true, false),
  ]);
  assert.deepEqual(s.asFavorite, { average: 4, games: 2 });
  assert.deepEqual(s.asUnderdog, { average: -4, games: 1 });
  assert.deepEqual(s.home, { average: 8, games: 2 });
  assert.deepEqual(s.away, { average: -3, games: 2 });
});

test("a split with no games is unavailable (null) rather than zero", () => {
  const s = summarizePerformance([row(1, 3, true, true), row(2, 5, true, true)]);
  assert.deepEqual(s.asUnderdog, { average: null, games: 0 });
  assert.deepEqual(s.away, { average: null, games: 0 });
});

test("last-10 uses the most recent games by date regardless of input order", () => {
  const rows: SummaryRow[] = [];
  for (let d = 1; d <= 15; d++) rows.push(row(d, d <= 5 ? -100 : 10, true, true));
  rows.reverse(); // scrambled input order
  const s = summarizePerformance(rows);
  assert.equal(s.lastTen.games, LAST_N_GAMES);
  assert.equal(s.lastTen.average, 10);
  assert.equal(s.games, 15);
});

test("fewer than 10 games: last-10 covers all of them", () => {
  const s = summarizePerformance([row(1, 2, true, true), row(2, 4, true, true)]);
  assert.deepEqual(s.lastTen, { average: 3, games: 2 });
});

test("summarizeSeasonTrend groups by year, ascending, with per-season averages", () => {
  const trend = summarizeSeasonTrend([
    seasonRow(2026, 4),
    seasonRow(2024, 10),
    seasonRow(2024, -2),
    seasonRow(2026, 0),
  ]);
  assert.deepEqual(trend, [
    { year: 2024, averageCoverMargin: 4, label: "OVER", games: 2 },
    { year: 2026, averageCoverMargin: 2, label: "OVER", games: 2 },
  ]);
});

test("summarizeSeasonTrend covers a team with a single season", () => {
  const trend = summarizeSeasonTrend([seasonRow(2026, 5), seasonRow(2026, 3)]);
  assert.deepEqual(trend, [{ year: 2026, averageCoverMargin: 4, label: "OVER", games: 2 }]);
});

test("summarizeSeasonTrend returns an empty array for a team with no graded games", () => {
  assert.deepEqual(summarizeSeasonTrend([]), []);
});
