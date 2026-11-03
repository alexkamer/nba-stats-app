import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveTags,
  marginAtEndOfPeriod,
  EARLY_BLOWOUT_MARGIN,
  LATE_COLLAPSE_LEAD,
  GARBAGE_TIME_MARGIN,
  SHOOTING_DEVIATION,
  type TagInput,
  type TimelinePoint,
} from "./performance-tags";

/** Builds a minimal timeline from [period, margin] pairs. */
function tl(...points: [number, number][]): TimelinePoint[] {
  return points.map(([period, margin]) => ({ period, margin }));
}

function input(overrides: Partial<TagInput>): TagInput {
  return {
    timeline: null,
    expectedMargin: 0,
    finalMargin: 0,
    starOut: null,
    gameFgPct: null,
    seasonFgPct: null,
    ...overrides,
  };
}

test("marginAtEndOfPeriod returns the margin after the last play at or before the period", () => {
  const t = tl([1, 4], [1, 6], [2, 10], [3, 12], [4, 3]);
  assert.equal(marginAtEndOfPeriod(t, 1), 6);
  assert.equal(marginAtEndOfPeriod(t, 2), 10);
  assert.equal(marginAtEndOfPeriod(t, 3), 12);
  assert.equal(marginAtEndOfPeriod([], 2), null);
});

// ---- STAR_OUT ----

test("STAR_OUT is tagged when a star is listed out", () => {
  assert.deepEqual(deriveTags(input({ starOut: true })), ["STAR_OUT"]);
});

test("STAR_OUT is not tagged when no star was out, or availability is unknown", () => {
  assert.deepEqual(deriveTags(input({ starOut: false })), []);
  assert.deepEqual(deriveTags(input({ starOut: null })), []);
});

// ---- EARLY_BLOWOUT ----

test("EARLY_BLOWOUT triggers at the threshold margin at halftime, for either side", () => {
  const winner = tl([1, 10], [2, EARLY_BLOWOUT_MARGIN], [3, 25], [4, 22]);
  assert.ok(deriveTags(input({ timeline: winner, finalMargin: 22 })).includes("EARLY_BLOWOUT"));
  const loser = tl([1, -10], [2, -EARLY_BLOWOUT_MARGIN], [4, -22]);
  assert.ok(deriveTags(input({ timeline: loser, finalMargin: -22 })).includes("EARLY_BLOWOUT"));
});

test("EARLY_BLOWOUT does not trigger just below the threshold, or when the margin only grows after halftime", () => {
  const below = tl([1, 10], [2, EARLY_BLOWOUT_MARGIN - 1], [4, 30]);
  assert.ok(!deriveTags(input({ timeline: below, finalMargin: 30 })).includes("EARLY_BLOWOUT"));
});

// ---- LATE_COLLAPSE ----

test("LATE_COLLAPSE triggers when a team led by the threshold and then lost", () => {
  const t = tl([1, LATE_COLLAPSE_LEAD], [3, 4], [4, -2]);
  assert.ok(deriveTags(input({ timeline: t, finalMargin: -2 })).includes("LATE_COLLAPSE"));
});

test("LATE_COLLAPSE does not trigger just below the threshold lead, or if the team still won", () => {
  const small = tl([1, LATE_COLLAPSE_LEAD - 1], [4, -2]);
  assert.ok(!deriveTags(input({ timeline: small, finalMargin: -2 })).includes("LATE_COLLAPSE"));
  const won = tl([1, 15], [3, 2], [4, 1]);
  assert.ok(!deriveTags(input({ timeline: won, finalMargin: 1 })).includes("LATE_COLLAPSE"));
});

// ---- GARBAGE_TIME_SWING ----

test("GARBAGE_TIME_SWING triggers when a big 3rd-quarter margin flips the cover result by the final buzzer", () => {
  // Favored by 10; led by 16 after three (covering), won by only 6 (not covering).
  const t = tl([1, 8], [2, 12], [3, GARBAGE_TIME_MARGIN + 1], [4, 6]);
  const tags = deriveTags(input({ timeline: t, expectedMargin: 10, finalMargin: 6 }));
  assert.ok(tags.includes("GARBAGE_TIME_SWING"));
});

test("GARBAGE_TIME_SWING triggers for the opposing team too (cover flips the other way)", () => {
  // The underdog: trailed by 16 (not covering +10), lost by only 6 (covers).
  const t = tl([1, -8], [2, -12], [3, -(GARBAGE_TIME_MARGIN + 1)], [4, -6]);
  const tags = deriveTags(input({ timeline: t, expectedMargin: -10, finalMargin: -6 }));
  assert.ok(tags.includes("GARBAGE_TIME_SWING"));
});

test("GARBAGE_TIME_SWING does not trigger when the cover result is unchanged, or the margin was below the threshold", () => {
  const same = tl([3, 20], [4, 25]);
  assert.ok(!deriveTags(input({ timeline: same, expectedMargin: 10, finalMargin: 25 })).includes("GARBAGE_TIME_SWING"));
  const smallMargin = tl([3, GARBAGE_TIME_MARGIN - 1], [4, 2]);
  assert.ok(!deriveTags(input({ timeline: smallMargin, expectedMargin: 10, finalMargin: 2 })).includes("GARBAGE_TIME_SWING"));
});

test("GARBAGE_TIME_SWING is omitted when the game never reached a 4th period", () => {
  const t = tl([1, 5], [2, 18], [3, 20]);
  assert.ok(!deriveTags(input({ timeline: t, expectedMargin: 25, finalMargin: 20 })).includes("GARBAGE_TIME_SWING"));
});

// ---- SHOOTING ----

test("SHOOTING_HOT and SHOOTING_COLD trigger at the deviation threshold", () => {
  const hot = deriveTags(input({ gameFgPct: 0.5 + SHOOTING_DEVIATION, seasonFgPct: 0.5 }));
  assert.deepEqual(hot, ["SHOOTING_HOT"]);
  const cold = deriveTags(input({ gameFgPct: 0.4 - SHOOTING_DEVIATION, seasonFgPct: 0.4 }));
  assert.deepEqual(cold, ["SHOOTING_COLD"]);
});

test("shooting tags do not trigger just below the threshold, or without data", () => {
  assert.deepEqual(deriveTags(input({ gameFgPct: 0.5 + SHOOTING_DEVIATION - 0.01, seasonFgPct: 0.5 })), []);
  assert.deepEqual(deriveTags(input({ gameFgPct: 0.6, seasonFgPct: null })), []);
  assert.deepEqual(deriveTags(input({ gameFgPct: null, seasonFgPct: 0.45 })), []);
});

// ---- missing data / no tags ----

test("with no play-by-play and no availability, only shooting tags can apply", () => {
  const tags = deriveTags(input({ timeline: null, gameFgPct: 0.3, seasonFgPct: 0.45 }));
  assert.deepEqual(tags, ["SHOOTING_COLD"]);
  assert.deepEqual(deriveTags(input({ timeline: [] })), []);
});

test("a game where no rule matches has no tags", () => {
  const t = tl([1, 3], [2, 5], [3, 6], [4, 7]);
  assert.deepEqual(deriveTags(input({ timeline: t, expectedMargin: 5, finalMargin: 7 })), []);
});
