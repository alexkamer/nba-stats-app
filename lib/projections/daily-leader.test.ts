import { test } from "node:test";
import assert from "node:assert/strict";
import { findDailyLeaders, hasTripleDouble, type DailyPlayerStatRow } from "./daily-leader";

function row(overrides: Partial<DailyPlayerStatRow>): DailyPlayerStatRow {
  return { playerId: 1, points: 0, rebounds: 0, assists: 0, threeMade: 0, steals: 0, blocks: 0, minutes: 30, ...overrides };
}

test("findDailyLeaders returns a single leader with the highest combined total", () => {
  const rows = [
    row({ playerId: 1, points: 30, rebounds: 5, assists: 5 }), // 40
    row({ playerId: 2, points: 20, rebounds: 10, assists: 5 }), // 35
  ];
  const leaders = findDailyLeaders(rows);
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0].playerId, 1);
  assert.equal(leaders[0].pointsReboundsAssists, 40);
});

test("findDailyLeaders returns every player tied for the top total", () => {
  const rows = [
    row({ playerId: 1, points: 30, rebounds: 5, assists: 5 }), // 40
    row({ playerId: 2, points: 10, rebounds: 20, assists: 10 }), // 40
    row({ playerId: 3, points: 10, rebounds: 10, assists: 10 }), // 30
  ];
  const leaders = findDailyLeaders(rows);
  assert.equal(leaders.length, 2);
  assert.deepEqual(leaders.map((l) => l.playerId).sort(), [1, 2]);
});

test("findDailyLeaders returns an empty array for no rows", () => {
  assert.deepEqual(findDailyLeaders([]), []);
});

test("hasTripleDouble is true when three categories reach double digits", () => {
  assert.equal(hasTripleDouble({ points: 15, rebounds: 11, assists: 10, threeMade: 2, steals: 1, blocks: 0, minutes: 36 }), true);
});

test("hasTripleDouble is false when only two categories reach double digits", () => {
  assert.equal(hasTripleDouble({ points: 15, rebounds: 11, assists: 8, threeMade: 2, steals: 1, blocks: 0, minutes: 36 }), false);
});

test("findDailyLeaders flags a tied leader's triple-double alongside their total", () => {
  const rows = [row({ playerId: 1, points: 15, rebounds: 11, assists: 10 })]; // 36, triple-double
  const leaders = findDailyLeaders(rows);
  assert.equal(leaders[0].hadTripleDouble, true);
});
