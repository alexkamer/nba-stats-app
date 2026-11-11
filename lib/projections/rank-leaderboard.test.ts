import { test } from "node:test";
import assert from "node:assert/strict";
import { rankLeaderboard } from "./rank-leaderboard";

test("rankLeaderboard orders candidates by descending projected value", () => {
  const ranked = rankLeaderboard([
    { playerId: 1, projectedValue: 30 },
    { playerId: 2, projectedValue: 50 },
    { playerId: 3, projectedValue: 40 },
  ]);
  assert.deepEqual(ranked.map((r) => r.playerId), [2, 3, 1]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test("rankLeaderboard gives tied-top candidates the same rank and skips ahead for the next one", () => {
  const ranked = rankLeaderboard([
    { playerId: 1, projectedValue: 50 },
    { playerId: 2, projectedValue: 50 },
    { playerId: 3, projectedValue: 40 },
  ]);
  assert.deepEqual(
    ranked.map((r) => ({ playerId: r.playerId, rank: r.rank })).sort((a, b) => a.playerId - b.playerId),
    [
      { playerId: 1, rank: 1 },
      { playerId: 2, rank: 1 },
      { playerId: 3, rank: 3 },
    ],
  );
});

test("rankLeaderboard returns an empty array for no candidates", () => {
  assert.deepEqual(rankLeaderboard([]), []);
});
