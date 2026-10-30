import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccuracy } from "./compute-accuracy";

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
