import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStdev,
  isBettable,
  combineStdev,
  computeEdgeRatio,
  marginToWinPct,
  BETTABLE_EDGE_STDEV_MULTIPLIER,
} from "./confidence";

test("computeStdev returns null below 2 values", () => {
  assert.equal(computeStdev([]), null);
  assert.equal(computeStdev([10]), null);
});

test("computeStdev computes population standard deviation", () => {
  assert.ok(Math.abs(computeStdev([2, 4, 4, 4, 5, 5, 7, 9])! - 2) < 1e-9);
});

test("isBettable is false with no line, no stdev, or zero stdev", () => {
  assert.equal(isBettable(14, null, 2), false);
  assert.equal(isBettable(14, 10.5, null), false);
  assert.equal(isBettable(14, 10.5, 0), false);
});

test("isBettable is false for a near-miss edge relative to variance", () => {
  // edge of 0.5 against a stdev of 4 is well below the threshold multiplier
  assert.equal(isBettable(15, 14.5, 4), false);
});

test("isBettable is true once the edge clears the stdev multiplier", () => {
  const stdev = 2;
  const line = 10.5;
  const projectedValue = line + BETTABLE_EDGE_STDEV_MULTIPLIER * stdev + 0.01;
  assert.equal(isBettable(projectedValue, line, stdev), true);
});

test("combineStdev pools two estimates", () => {
  assert.ok(Math.abs(combineStdev(3, 4)! - Math.sqrt((9 + 16) / 2)) < 1e-9);
});

test("computeEdgeRatio returns null with no line or no stdev", () => {
  assert.equal(computeEdgeRatio(14, null, 2), null);
  assert.equal(computeEdgeRatio(14, 10.5, null), null);
});

test("computeEdgeRatio matches the ratio isBettable thresholds against", () => {
  assert.equal(computeEdgeRatio(14, 10, 2), 2);
});

test("combineStdev falls back to whichever single estimate is available", () => {
  assert.equal(combineStdev(3, null), 3);
  assert.equal(combineStdev(null, 4), 4);
  assert.equal(combineStdev(null, null), null);
});

test("marginToWinPct returns 50 for a dead-even projection", () => {
  assert.ok(Math.abs(marginToWinPct(0, 10)! - 50) < 1e-6);
});

test("marginToWinPct favors the home team as the margin grows positive", () => {
  const pct = marginToWinPct(7, 12);
  assert.ok(pct! > 50 && pct! < 100);
});

test("marginToWinPct favors the away team (low home win%) as the margin grows negative", () => {
  const pct = marginToWinPct(-7, 12);
  assert.ok(pct! < 50 && pct! > 0);
});

test("marginToWinPct is symmetric around 50 for equal and opposite margins", () => {
  const favored = marginToWinPct(7, 12)!;
  const underdog = marginToWinPct(-7, 12)!;
  assert.ok(Math.abs(favored + underdog - 100) < 1e-9);
});

test("marginToWinPct returns null with no or non-positive stdev", () => {
  assert.equal(marginToWinPct(7, null), null);
  assert.equal(marginToWinPct(7, 0), null);
  assert.equal(marginToWinPct(7, -1), null);
});
