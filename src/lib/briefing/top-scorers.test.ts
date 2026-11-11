import { test } from "node:test";
import assert from "node:assert/strict";
import { rankTopScorers } from "./top-scorers";

test("rankTopScorers returns the top N by points, descending", () => {
  const rows = [
    { playerId: 1, points: 20 },
    { playerId: 2, points: 35 },
    { playerId: 3, points: 10 },
    { playerId: 4, points: 28 },
    { playerId: 5, points: 15 },
    { playerId: 6, points: 40 },
  ];
  const top = rankTopScorers(rows, 5);
  assert.deepEqual(top.map((r) => r.playerId), [6, 2, 4, 1, 5]);
});

test("rankTopScorers breaks ties by ascending playerId deterministically", () => {
  const rows = [
    { playerId: 3, points: 20 },
    { playerId: 1, points: 20 },
    { playerId: 2, points: 20 },
  ];
  const top = rankTopScorers(rows, 5);
  assert.deepEqual(top.map((r) => r.playerId), [1, 2, 3]);
});

test("rankTopScorers returns fewer than limit when fewer rows exist", () => {
  const rows = [{ playerId: 1, points: 10 }];
  assert.equal(rankTopScorers(rows, 5).length, 1);
});
