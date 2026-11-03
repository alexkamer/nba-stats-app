import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMargins,
  labelFor,
  averageLabel,
  averageCoverMargin,
  favoriteFlag,
  STRONG_THRESHOLD,
  AS_EXPECTED_BAND,
} from "./grade-performance";
import { gradeAtsCover } from "./grade-cover";

test("home favorite by 13.5 who wins by 3 has a cover margin of -10.5", () => {
  const { home, away } = computeMargins(-13.5, 103, 100);
  assert.equal(home.expectedMargin, 13.5);
  assert.equal(home.actualMargin, 3);
  assert.equal(home.coverMargin, -10.5);
  assert.equal(away.coverMargin, 10.5);
});

test("home 3-point underdog who loses by 2 has a cover margin of +1", () => {
  // home underdog: spread is +3 (home-relative)
  const { home } = computeMargins(3, 98, 100);
  assert.equal(home.expectedMargin, -3);
  assert.equal(home.actualMargin, -2);
  assert.equal(home.coverMargin, 1);
});

test("away favorite is graded from the away perspective", () => {
  // home is +6.5 underdog, so away is favored by 6.5; away wins by 10
  const { away } = computeMargins(6.5, 90, 100);
  assert.equal(away.expectedMargin, 6.5);
  assert.equal(away.actualMargin, 10);
  assert.equal(away.coverMargin, 3.5);
});

test("a pick'em never produces negative zero", () => {
  const { home, away } = computeMargins(0, 100, 100);
  assert.ok(Object.is(home.expectedMargin, 0));
  assert.ok(Object.is(home.actualMargin, 0));
  assert.ok(Object.is(home.coverMargin, 0));
  assert.ok(Object.is(away.coverMargin, 0));
});

test("landing exactly on the line gives a cover margin of zero", () => {
  const { home } = computeMargins(-5, 105, 100);
  assert.equal(home.coverMargin, 0);
});

test("the two teams' cover margins are always equal and opposite", () => {
  for (const [spread, h, a] of [
    [-13.5, 103, 100],
    [4.5, 88, 120],
    [-1, 99, 110],
    [0, 101, 100],
  ] as const) {
    const { home, away } = computeMargins(spread, h, a);
    assert.equal(home.coverMargin + away.coverMargin, 0);
  }
});

test("cover margin sign agrees with gradeAtsCover for every scenario", () => {
  for (const [spread, h, a] of [
    [-5.5, 110, 102],
    [-5.5, 105, 102],
    [-5, 105, 100],
    [3, 98, 100],
    [3, 90, 100],
    [0, 101, 100],
  ] as const) {
    const graded = gradeAtsCover(spread, h, a);
    const { home } = computeMargins(spread, h, a);
    if (graded.home === "COVER") assert.ok(home.coverMargin > 0);
    else if (graded.home === "NO_COVER") assert.ok(home.coverMargin < 0);
    else assert.equal(home.coverMargin, 0);
  }
});

test("labelFor covers every bucket and boundary", () => {
  assert.equal(labelFor(STRONG_THRESHOLD), "STRONG_OVER");
  assert.equal(labelFor(STRONG_THRESHOLD + 10), "STRONG_OVER");
  assert.equal(labelFor(STRONG_THRESHOLD - 0.5), "OVER");
  assert.equal(labelFor(AS_EXPECTED_BAND), "OVER");
  assert.equal(labelFor(AS_EXPECTED_BAND - 0.5), "AS_EXPECTED");
  assert.equal(labelFor(0), "AS_EXPECTED");
  assert.equal(labelFor(-(AS_EXPECTED_BAND - 0.5)), "AS_EXPECTED");
  assert.equal(labelFor(-AS_EXPECTED_BAND), "UNDER");
  assert.equal(labelFor(-(STRONG_THRESHOLD - 0.5)), "UNDER");
  assert.equal(labelFor(-STRONG_THRESHOLD), "STRONG_UNDER");
  assert.equal(labelFor(-30), "STRONG_UNDER");
});

test("labels are independent of win/loss: a close underdog loss is as expected, a narrow favorite win is under", () => {
  assert.equal(labelFor(computeMargins(3, 98, 100).home.coverMargin), "AS_EXPECTED");
  assert.equal(labelFor(computeMargins(-13.5, 103, 100).home.coverMargin), "UNDER");
  // a favorite that wins but misses the number by 20 is strongly under
  assert.equal(labelFor(computeMargins(-20, 101, 100).home.coverMargin), "STRONG_UNDER");
});

test("averageLabel uses a tighter band than per-game labels", () => {
  assert.equal(averageLabel(1.5), "OVER");
  assert.equal(averageLabel(1.4), "AS_EXPECTED");
  assert.equal(averageLabel(-1.4), "AS_EXPECTED");
  assert.equal(averageLabel(-1.5), "UNDER");
});

test("averageCoverMargin returns null for an empty split instead of zero", () => {
  assert.equal(averageCoverMargin([]), null);
  assert.equal(averageCoverMargin([2, -4, 5]), 1);
});

test("favoriteFlag: positive expected margin = favorite, negative = underdog, zero = neither", () => {
  assert.equal(favoriteFlag(3), true);
  assert.equal(favoriteFlag(-3), false);
  assert.equal(favoriteFlag(0), null);
});
