import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unscopedVariant,
  seasonScopedVariant,
  hasPriorSeasonHistory,
  createErrorAccumulator,
  addError,
  meanAbsoluteError,
  meanSignedError,
  type BacktestLogEntry,
} from "./backtest-methodology";

function entry(
  partial: Omit<Partial<BacktestLogEntry>, "date"> & { seasonId: number; date: string },
): BacktestLogEntry {
  return {
    gameId: 0,
    points: null,
    rebounds: null,
    assists: null,
    threeMade: null,
    steals: null,
    blocks: null,
    minutes: null,
    ...partial,
    date: new Date(partial.date),
  };
}

test("unscopedVariant averages a player's full history regardless of season", () => {
  const log = [
    entry({ gameId: 1, seasonId: 1, date: "2024-01-01", points: 20, rebounds: 10 }),
    entry({ gameId: 2, seasonId: 1, date: "2024-01-03", points: 22, rebounds: 8 }),
    entry({ gameId: 3, seasonId: 2, date: "2025-01-01", points: 4, rebounds: 3 }),
  ];
  // Target is the player's first game of season 2 (index 2); prior history
  // spans only season 1.
  const inputs = unscopedVariant(log, 2, "POINTS_REBOUNDS");
  // (30 + 30) / 2 = 30 — the career average leaks in from season 1.
  assert.equal(inputs.seasonAverage, 30);
});

test("seasonScopedVariant excludes prior-season games from the season average", () => {
  const log = [
    entry({ gameId: 1, seasonId: 1, date: "2024-01-01", points: 20, rebounds: 10 }),
    entry({ gameId: 2, seasonId: 1, date: "2024-01-03", points: 22, rebounds: 8 }),
    entry({ gameId: 3, seasonId: 2, date: "2025-01-01", points: 4, rebounds: 3 }),
    entry({ gameId: 4, seasonId: 2, date: "2025-01-05", points: 6, rebounds: 5 }),
  ];
  // Target is the player's second game of season 2 (index 3); one prior
  // same-season game (index 2, value 7) exists.
  const inputs = seasonScopedVariant(log, 3, "POINTS_REBOUNDS");
  assert.equal(inputs.seasonAverage, 7);
});

test("seasonScopedVariant returns a null season average with no current-season games yet", () => {
  const log = [
    entry({ gameId: 1, seasonId: 1, date: "2024-01-01", points: 20, rebounds: 10 }),
    entry({ gameId: 2, seasonId: 1, date: "2024-01-03", points: 22, rebounds: 8 }),
    entry({ gameId: 3, seasonId: 2, date: "2025-01-01", points: 4, rebounds: 3 }),
  ];
  // Target (index 2) is this player's first logged game of season 2 — no
  // prior season-2 entries exist yet, even though prior history overall does.
  const inputs = seasonScopedVariant(log, 2, "POINTS_REBOUNDS");
  assert.equal(inputs.seasonAverage, null);
});

test("both variants use the same unscoped recent-form window", () => {
  const log = [
    entry({ gameId: 1, seasonId: 1, date: "2024-01-01", points: 20, rebounds: 10 }),
    entry({ gameId: 2, seasonId: 2, date: "2025-01-01", points: 4, rebounds: 3 }),
    entry({ gameId: 3, seasonId: 2, date: "2025-01-03", points: 6, rebounds: 5 }),
  ];
  const unscoped = unscopedVariant(log, 2, "POINTS_REBOUNDS");
  const seasonScoped = seasonScopedVariant(log, 2, "POINTS_REBOUNDS");
  assert.deepEqual(unscoped.recentValues, seasonScoped.recentValues);
  assert.deepEqual(unscoped.recentMinutes, seasonScoped.recentMinutes);
});

test("hasPriorSeasonHistory is false for a player's first tracked season", () => {
  const log = [
    entry({ gameId: 1, seasonId: 1, date: "2024-01-01" }),
    entry({ gameId: 2, seasonId: 1, date: "2024-01-03" }),
  ];
  assert.equal(hasPriorSeasonHistory(log, 1), false);
});

test("hasPriorSeasonHistory is true once a player has a prior-season entry", () => {
  const log = [
    entry({ gameId: 1, seasonId: 1, date: "2024-01-01" }),
    entry({ gameId: 2, seasonId: 2, date: "2025-01-01" }),
  ];
  assert.equal(hasPriorSeasonHistory(log, 1), true);
});

test("error accumulator computes mean absolute and signed error", () => {
  const acc = createErrorAccumulator();
  addError(acc, 12, 10); // +2
  addError(acc, 8, 10); // -2
  addError(acc, 15, 10); // +5
  assert.equal(acc.n, 3);
  assert.ok(Math.abs(meanAbsoluteError(acc)! - 3) < 1e-9); // (2 + 2 + 5) / 3
  assert.ok(Math.abs(meanSignedError(acc)! - (5 / 3)) < 1e-9); // (2 - 2 + 5) / 3
});

test("error accumulator metrics are null with no recorded errors", () => {
  const acc = createErrorAccumulator();
  assert.equal(meanAbsoluteError(acc), null);
  assert.equal(meanSignedError(acc), null);
});
