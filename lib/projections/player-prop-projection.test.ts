import { test } from "node:test";
import assert from "node:assert/strict";
import { projectPlayerStat } from "./player-prop-projection";

test("projectPlayerStat blends season average with recent form", () => {
  const result = projectPlayerStat({
    seasonAverage: 20,
    recentValues: [24, 26, 25, 23, 27],
    recentMinutes: [34, 35, 33, 34, 36],
  });
  assert.ok(result);
  // Recent form (avg 25) is weighted above season average (20), so the
  // blended result should sit between them, closer to recent form.
  assert.ok(result > 22 && result < 25.5, `expected a value between season and recent form, got ${result}`);
});

test("projectPlayerStat dampens a projection when recent minutes are trending down", () => {
  const steadyMinutes = projectPlayerStat({
    seasonAverage: 20,
    recentValues: [20, 20, 20, 20, 20],
    recentMinutes: [32, 32, 32, 32, 32],
  });
  const decliningMinutes = projectPlayerStat({
    seasonAverage: 20,
    recentValues: [20, 20, 20, 20, 20],
    recentMinutes: [32, 32, 20, 18, 16],
  });
  assert.ok(steadyMinutes);
  assert.ok(decliningMinutes);
  assert.ok(decliningMinutes < steadyMinutes, "a recent minutes decline should pull the projection down");
});

test("projectPlayerStat returns null with no season average and no recent games", () => {
  assert.equal(projectPlayerStat({ seasonAverage: null, recentValues: [], recentMinutes: [] }), null);
});

test("projectPlayerStat falls back to season average alone below the recent-game threshold", () => {
  const result = projectPlayerStat({ seasonAverage: 18, recentValues: [30], recentMinutes: [35] });
  assert.equal(result, 18);
});
