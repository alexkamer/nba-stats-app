import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeKingOfTheCourt } from "./grade-king-of-the-court";

test("gradeKingOfTheCourt is a hit when the single top-ranked player matches the actual leader", () => {
  assert.equal(gradeKingOfTheCourt([1], [1]), true);
});

test("gradeKingOfTheCourt is a miss when the top-ranked player isn't the actual leader", () => {
  assert.equal(gradeKingOfTheCourt([1], [2]), false);
});

test("gradeKingOfTheCourt is a hit when only one of a rank-1 tie matches the actual leader", () => {
  assert.equal(gradeKingOfTheCourt([1, 2], [2]), true);
});

test("gradeKingOfTheCourt is a miss when neither of a rank-1 tie matches any actual leader", () => {
  assert.equal(gradeKingOfTheCourt([1, 2], [3, 4]), false);
});
