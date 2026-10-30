import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeGameProjection, gradePredictorSnapshot } from "./grade-game";

test("gradeGameProjection marks a correct pick when the predicted side matches the actual winner", () => {
  const result = gradeGameProjection(5, 110, 102);
  assert.equal(result.correct, true);
  assert.equal(result.marginError, 3); // predicted +5, actual +8
});

test("gradeGameProjection marks an incorrect pick when the predicted side loses", () => {
  const result = gradeGameProjection(5, 100, 108);
  assert.equal(result.correct, false);
});

test("gradeGameProjection treats an exact tie prediction as correct only if the actual game also ties", () => {
  const result = gradeGameProjection(0, 100, 100);
  assert.equal(result.correct, true);
  assert.equal(result.marginError, 0);
});

test("gradePredictorSnapshot marks correct when the favored side wins", () => {
  const result = gradePredictorSnapshot(60, 40, 105, 100);
  assert.equal(result.correct, true);
  assert.equal(result.marginError, 40);
});

test("gradePredictorSnapshot marks incorrect when the underdog wins", () => {
  const result = gradePredictorSnapshot(60, 40, 95, 100);
  assert.equal(result.correct, false);
  assert.equal(result.marginError, 60);
});
