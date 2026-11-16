import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAllowedStatRows,
  leagueAverageAllowed,
  computeOpponentPrediction,
  predictedAllowedValue,
  seasonProgressBucket,
  type TeamAllowedEntry,
} from "./backtest-opponent-factor";
import { computeOpponentFactors } from "./opponent-factor";

function opponentRow(points: number, rebounds = 0): TeamAllowedEntry["opponentRow"] {
  return { points, rebounds, assists: 0, threeMade: 0, steals: 0, blocks: 0, minutes: null };
}

function entry(partial: Omit<Partial<TeamAllowedEntry>, "date"> & { seasonId: number; teamId: number; date: string; points: number }): TeamAllowedEntry {
  return {
    gameId: 0,
    opponentRow: opponentRow(partial.points),
    ...partial,
    date: new Date(partial.date),
  };
}

test("buildAllowedStatRows extracts the opponent's stat value per entry", () => {
  const entries: TeamAllowedEntry[] = [
    entry({ seasonId: 1, teamId: 10, date: "2024-01-01", points: 100 }),
    entry({ seasonId: 1, teamId: 11, date: "2024-01-03", points: 110 }),
  ];
  const rows = buildAllowedStatRows(entries, "POINTS");
  assert.deepEqual(rows, [
    { teamId: 10, allowedValue: 100 },
    { teamId: 11, allowedValue: 110 },
  ]);
});

test("leagueAverageAllowed averages the stat across every entry", () => {
  const entries: TeamAllowedEntry[] = [
    entry({ seasonId: 1, teamId: 10, date: "2024-01-01", points: 100 }),
    entry({ seasonId: 1, teamId: 11, date: "2024-01-03", points: 120 }),
  ];
  assert.equal(leagueAverageAllowed(entries, "POINTS"), 110);
});

test("leagueAverageAllowed returns null for no entries", () => {
  assert.equal(leagueAverageAllowed([], "POINTS"), null);
});

test("computeOpponentPrediction + predictedAllowedValue matches calling computeOpponentFactors directly", () => {
  // Six games so team 10 clears MIN_GAMES_FOR_FACTOR (5) in opponent-factor.ts.
  const entries: TeamAllowedEntry[] = [
    entry({ seasonId: 1, teamId: 10, date: "2024-01-01", points: 100 }),
    entry({ seasonId: 1, teamId: 10, date: "2024-01-03", points: 105 }),
    entry({ seasonId: 1, teamId: 10, date: "2024-01-05", points: 95 }),
    entry({ seasonId: 1, teamId: 10, date: "2024-01-07", points: 100 }),
    entry({ seasonId: 1, teamId: 10, date: "2024-01-09", points: 100 }),
    entry({ seasonId: 1, teamId: 10, date: "2024-01-11", points: 100 }),
    entry({ seasonId: 1, teamId: 20, date: "2024-01-02", points: 130 }),
    entry({ seasonId: 1, teamId: 20, date: "2024-01-04", points: 130 }),
    entry({ seasonId: 1, teamId: 20, date: "2024-01-06", points: 130 }),
    entry({ seasonId: 1, teamId: 20, date: "2024-01-08", points: 130 }),
    entry({ seasonId: 1, teamId: 20, date: "2024-01-10", points: 130 }),
  ];
  const prediction = computeOpponentPrediction(entries, "POINTS");
  const expectedFactors = computeOpponentFactors(buildAllowedStatRows(entries, "POINTS"));
  const expectedLeagueAvg = leagueAverageAllowed(entries, "POINTS");

  assert.deepEqual(prediction.factors, expectedFactors);
  assert.equal(prediction.leagueAverage, expectedLeagueAvg);
  assert.equal(
    predictedAllowedValue(prediction, 10),
    (expectedFactors.get(10) ?? 1) * expectedLeagueAvg!,
  );
});

test("predictedAllowedValue returns null with no history to predict from", () => {
  const prediction = computeOpponentPrediction([], "POINTS");
  assert.equal(predictedAllowedValue(prediction, 10), null);
});

test("season-scoped prediction excludes a prior-season entry that an unscoped prediction includes", () => {
  const priorSeason: TeamAllowedEntry[] = [
    entry({ seasonId: 1, teamId: 10, date: "2023-01-01", points: 150 }),
  ];
  const currentSeason: TeamAllowedEntry[] = [
    entry({ seasonId: 2, teamId: 10, date: "2024-01-01", points: 100 }),
    entry({ seasonId: 2, teamId: 20, date: "2024-01-02", points: 100 }),
  ];
  const unscopedEntries = [...priorSeason, ...currentSeason];
  const seasonScopedEntries = currentSeason;

  const unscopedLeagueAvg = leagueAverageAllowed(unscopedEntries, "POINTS");
  const seasonScopedLeagueAvg = leagueAverageAllowed(seasonScopedEntries, "POINTS");

  // The prior-season 150-point game pulls the unscoped league average up;
  // the season-scoped one excludes it entirely.
  assert.equal(seasonScopedLeagueAvg, 100);
  assert.notEqual(unscopedLeagueAvg, seasonScopedLeagueAvg);
});

test("seasonProgressBucket assigns the documented ranges", () => {
  assert.equal(seasonProgressBucket(0), "0-4");
  assert.equal(seasonProgressBucket(4), "0-4");
  assert.equal(seasonProgressBucket(5), "5-14");
  assert.equal(seasonProgressBucket(14), "5-14");
  assert.equal(seasonProgressBucket(15), "15+");
  assert.equal(seasonProgressBucket(82), "15+");
});
