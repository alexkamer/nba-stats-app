import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEligibleStreakStatType,
  computeConsecutiveStreak,
  computeHitRate,
  evaluatePlayerStreak,
  pickHighestNotableThreshold,
  resolveRelevantDate,
  STREAK_STAT_THRESHOLDS,
} from "./player-prop-streaks";

test("isEligibleStreakStatType accepts the full ladder of eligible stat types", () => {
  assert.equal(isEligibleStreakStatType("POINTS"), true);
  assert.equal(isEligibleStreakStatType("REBOUNDS"), true);
  assert.equal(isEligibleStreakStatType("ASSISTS"), true);
  assert.equal(isEligibleStreakStatType("THREE_POINTERS_MADE"), true);
  assert.equal(isEligibleStreakStatType("POINTS_REBOUNDS_ASSISTS"), true);
  assert.equal(isEligibleStreakStatType("POINTS_REBOUNDS"), true);
  assert.equal(isEligibleStreakStatType("POINTS_ASSISTS"), true);
  assert.equal(isEligibleStreakStatType("REBOUNDS_ASSISTS"), true);
  assert.equal(isEligibleStreakStatType("DOUBLE_DOUBLE"), true);
  assert.equal(isEligibleStreakStatType("TRIPLE_DOUBLE"), false);
  assert.equal(isEligibleStreakStatType("STEALS"), false);
});

test("computeConsecutiveStreak counts leading games meeting the floor", () => {
  assert.equal(computeConsecutiveStreak([12, 14, 10, 8], 10), 3);
});

test("computeConsecutiveStreak is zero when the most recent game misses the floor", () => {
  assert.equal(computeConsecutiveStreak([8, 14, 12, 10], 10), 0);
});

test("computeHitRate uses up to the last 10 games", () => {
  const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 2, 10, 10];
  assert.equal(computeHitRate(values, 10), 0.9);
});

test("computeHitRate returns null for an empty game log", () => {
  assert.equal(computeHitRate([], 10), null);
});

test("evaluatePlayerStreak flags a player clearing the floor 3+ straight games", () => {
  const result = evaluatePlayerStreak([12, 14, 10, 4, 4, 4, 4, 4, 4, 4], 10);
  assert.equal(result.streak, 3);
  assert.equal(result.notable, true);
});

test("evaluatePlayerStreak flags a player at >=90% hit rate even with a broken current streak", () => {
  // Most recent game missed the floor (streak = 0), but 9 of the last 10 hit it.
  const values = [8, 10, 10, 10, 10, 10, 10, 10, 10, 10];
  const result = evaluatePlayerStreak(values, 10);
  assert.equal(result.streak, 0);
  assert.equal(result.hitRate, 0.9);
  assert.equal(result.notable, true);
});

test("evaluatePlayerStreak does not flag a player below both thresholds", () => {
  const values = [8, 10, 8, 10, 8, 10, 8, 10, 8, 10];
  const result = evaluatePlayerStreak(values, 10);
  assert.equal(result.streak, 0);
  assert.equal(result.hitRate, 0.5);
  assert.equal(result.notable, false);
});

test("pickHighestNotableThreshold reports the highest notable rung, not the lowest", () => {
  // 5 straight games at 22 points clears every POINTS rung up to 20+, but not 25+.
  const values = [22, 22, 22, 22, 22];
  const result = pickHighestNotableThreshold(values, STREAK_STAT_THRESHOLDS.POINTS);
  assert.equal(result?.threshold, 20);
  assert.equal(result?.streak, 5);
});

test("pickHighestNotableThreshold returns null when no rung is notable", () => {
  const values = [8, 6, 9, 7, 8, 6, 9, 7, 8, 6];
  const result = pickHighestNotableThreshold(values, STREAK_STAT_THRESHOLDS.POINTS);
  assert.equal(result, null);
});

test("resolveRelevantDate picks today when today has an eligible date", () => {
  const today = new Date(2026, 10, 3);
  const result = resolveRelevantDate(today, [new Date(2026, 10, 3), new Date(2026, 10, 5)]);
  assert.equal(result?.getTime(), new Date(2026, 10, 3).getTime());
});

test("resolveRelevantDate picks the nearest upcoming date when today has none", () => {
  const today = new Date(2026, 10, 3);
  const result = resolveRelevantDate(today, [new Date(2026, 10, 7), new Date(2026, 10, 5)]);
  assert.equal(result?.getTime(), new Date(2026, 10, 5).getTime());
});

test("resolveRelevantDate ignores past dates", () => {
  const today = new Date(2026, 10, 3);
  const result = resolveRelevantDate(today, [new Date(2026, 10, 1)]);
  assert.equal(result, null);
});

test("resolveRelevantDate returns null when no eligible date exists at all", () => {
  assert.equal(resolveRelevantDate(new Date(2026, 10, 3), []), null);
});
