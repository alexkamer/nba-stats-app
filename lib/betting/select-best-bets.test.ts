import { test } from "node:test";
import assert from "node:assert/strict";
import { selectBestBets } from "./select-best-bets";

test("selectBestBets keeps only a player's highest-edge pick when they have multiple", () => {
  const picks = selectBestBets(
    [
      { playerId: 1, statType: "POINTS", edgeRatio: 1.2 },
      { playerId: 1, statType: "REBOUNDS", edgeRatio: 2.4 },
      { playerId: 1, statType: "POINTS_REBOUNDS", edgeRatio: 1.8 },
      { playerId: 2, statType: "ASSISTS", edgeRatio: 1.0 },
    ],
    8,
  );
  assert.equal(picks.length, 2);
  assert.deepEqual(
    picks.map((p) => `${p.playerId}-${p.statType}`),
    ["1-REBOUNDS", "2-ASSISTS"],
  );
});

test("selectBestBets returns fewer than limit when fewer distinct players qualify, without backfill", () => {
  const picks = selectBestBets(
    [
      { playerId: 1, edgeRatio: 2.0 },
      { playerId: 2, edgeRatio: 1.5 },
    ],
    8,
  );
  assert.equal(picks.length, 2);
});

test("selectBestBets returns exactly limit picks, ranked by edge ratio, when more than limit distinct players qualify", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ playerId: i, edgeRatio: i }));
  const picks = selectBestBets(candidates, 8);
  assert.equal(picks.length, 8);
  assert.deepEqual(
    picks.map((p) => p.playerId),
    [9, 8, 7, 6, 5, 4, 3, 2],
  );
});
