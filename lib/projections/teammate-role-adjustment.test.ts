import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTeammateRoleAdjustment } from "./teammate-role-adjustment";

test("a clear production increase in qualifying games produces a multiplier above 1", () => {
  const multiplier = computeTeammateRoleAdjustment({
    values: [18, 20, 19, 28, 30, 27],
    teammateWasOut: [false, false, false, true, true, true],
    baseline: 19,
  });
  assert.ok(multiplier > 1, `expected a multiplier above 1, got ${multiplier}`);
});

test("fewer than 2 qualifying games returns exactly 1", () => {
  const oneGame = computeTeammateRoleAdjustment({
    values: [18, 20, 19, 30],
    teammateWasOut: [false, false, false, true],
    baseline: 19,
  });
  assert.equal(oneGame, 1);

  const noGames = computeTeammateRoleAdjustment({
    values: [18, 20, 19],
    teammateWasOut: [false, false, false],
    baseline: 19,
  });
  assert.equal(noGames, 1);
});

test("the multiplier is clamped at the extremes", () => {
  const extremeIncrease = computeTeammateRoleAdjustment({
    values: [10, 10, 60, 60],
    teammateWasOut: [false, false, true, true],
    baseline: 10,
  });
  assert.equal(extremeIncrease, 1.3);

  const extremeDecrease = computeTeammateRoleAdjustment({
    values: [20, 20, 1, 1],
    teammateWasOut: [false, false, true, true],
    baseline: 20,
  });
  assert.equal(extremeDecrease, 0.85);
});

test("a non-positive baseline returns the neutral multiplier rather than dividing by zero", () => {
  const multiplier = computeTeammateRoleAdjustment({
    values: [10, 10, 10, 10],
    teammateWasOut: [false, false, true, true],
    baseline: 0,
  });
  assert.equal(multiplier, 1);
});
