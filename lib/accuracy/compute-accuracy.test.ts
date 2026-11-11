import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccuracy, accuracyByMethod, accuracyByStatType, computeKingOfTheCourtAccuracy } from "./compute-accuracy";

test("computeAccuracy computes the hit rate from graded rows", () => {
  const result = computeAccuracy([true, true, false, true, false]);
  assert.equal(result.graded, 5);
  assert.equal(result.correct, 3);
  assert.equal(result.hitRate, 0.6);
});

test("computeAccuracy excludes pushes (null) from both the numerator and denominator", () => {
  const result = computeAccuracy([true, null, false, null]);
  assert.equal(result.graded, 2);
  assert.equal(result.correct, 1);
  assert.equal(result.hitRate, 0.5);
});

test("computeAccuracy returns a defined no-data result for an empty input instead of dividing by zero", () => {
  const result = computeAccuracy([]);
  assert.deepEqual(result, { graded: 0, correct: 0, hitRate: null });
});

test("computeAccuracy returns a no-data result when every row is a push", () => {
  const result = computeAccuracy([null, null]);
  assert.deepEqual(result, { graded: 0, correct: 0, hitRate: null });
});

test("accuracyByMethod computes an independent hit rate per method tag", () => {
  const rows = [
    { method: "v1", gradedCorrect: true },
    { method: "v1", gradedCorrect: false },
    { method: "v2", gradedCorrect: true },
    { method: "v2", gradedCorrect: true },
  ];
  const result = accuracyByMethod(rows, (r) => r.gradedCorrect);
  assert.deepEqual(result.v1, { graded: 2, correct: 1, hitRate: 0.5 });
  assert.deepEqual(result.v2, { graded: 2, correct: 2, hitRate: 1 });
});

test("accuracyByMethod omits a method with no rows rather than inventing an empty entry", () => {
  const result = accuracyByMethod([{ method: "v1", gradedCorrect: true }], (r) => r.gradedCorrect);
  assert.equal(Object.keys(result).length, 1);
  assert.equal("v2" in result, false);
});

test("accuracyByMethod returns an empty object for empty input", () => {
  assert.deepEqual(accuracyByMethod([], (r: { method: string; gradedCorrect: boolean | null }) => r.gradedCorrect), {});
});

test("accuracyByStatType computes an independent hit rate per stat type", () => {
  const rows = [
    { statType: "POINTS", gradedCorrect: true },
    { statType: "POINTS", gradedCorrect: true },
    { statType: "ASSISTS", gradedCorrect: false },
  ];
  const result = accuracyByStatType(rows, (r) => r.gradedCorrect);
  assert.deepEqual(result.POINTS, { graded: 2, correct: 2, hitRate: 1 });
  assert.deepEqual(result.ASSISTS, { graded: 1, correct: 0, hitRate: 0 });
});

test("accuracyByStatType reports a null hit rate for a stat type with zero graded picks rather than dividing by zero", () => {
  const result = accuracyByStatType([{ statType: "POINTS", gradedCorrect: null }], (r) => r.gradedCorrect);
  assert.deepEqual(result.POINTS, { graded: 0, correct: 0, hitRate: null });
});

test("computeKingOfTheCourtAccuracy only counts rank-1 entries toward the hit rate", () => {
  const result = computeKingOfTheCourtAccuracy([
    { rank: 1, gradedHit: true },
    { rank: 2, gradedHit: null },
    { rank: 1, gradedHit: false },
    { rank: 3, gradedHit: null },
  ]);
  assert.deepEqual(result, { graded: 2, correct: 1, hitRate: 0.5 });
});

test("computeKingOfTheCourtAccuracy returns a null hit rate when nothing is graded yet", () => {
  const result = computeKingOfTheCourtAccuracy([{ rank: 1, gradedHit: null }]);
  assert.deepEqual(result, { graded: 0, correct: 0, hitRate: null });
});
