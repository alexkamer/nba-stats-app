import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeAtsCover, gradeOverUnder, nextStreak } from "./grade-cover";

test("gradeAtsCover marks the home side as covering when it beats the spread", () => {
  // home favored by 5.5 (spread -5.5), wins by 8 -> covers
  const result = gradeAtsCover(-5.5, 110, 102);
  assert.equal(result.home, "COVER");
  assert.equal(result.away, "NO_COVER");
});

test("gradeAtsCover marks the away side as covering when the home favorite fails to beat the spread", () => {
  // home favored by 5.5, wins by only 2 -> away covers
  const result = gradeAtsCover(-5.5, 104, 102);
  assert.equal(result.home, "NO_COVER");
  assert.equal(result.away, "COVER");
});

test("gradeAtsCover marks a push when the actual margin lands exactly on the line", () => {
  // home favored by 5, wins by exactly 5
  const result = gradeAtsCover(-5, 105, 100);
  assert.equal(result.home, "PUSH");
  assert.equal(result.away, "PUSH");
});

test("gradeOverUnder marks over when the combined score exceeds the total", () => {
  assert.equal(gradeOverUnder(220.5, 115, 110), "OVER");
});

test("gradeOverUnder marks under when the combined score falls short of the total", () => {
  assert.equal(gradeOverUnder(220.5, 100, 105), "UNDER");
});

test("gradeOverUnder marks a push when the combined score lands exactly on the total", () => {
  assert.equal(gradeOverUnder(220, 110, 110), "PUSH");
});

test("nextStreak extends a winning streak on another win", () => {
  assert.equal(nextStreak(2, "WIN"), 3);
});

test("nextStreak resets to the opposite direction when a winning streak breaks", () => {
  assert.equal(nextStreak(2, "LOSS"), -1);
});

test("nextStreak leaves the streak unchanged on a push", () => {
  assert.equal(nextStreak(3, "PUSH"), 3);
  assert.equal(nextStreak(-2, "PUSH"), -2);
});

test("nextStreak starts a streak from zero", () => {
  assert.equal(nextStreak(0, "WIN"), 1);
  assert.equal(nextStreak(0, "LOSS"), -1);
});
