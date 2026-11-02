import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeGameProjection,
  gradeMarketFavorite,
  gradePredictorSnapshot,
  gradeSpreadCoverage,
  gradeTotalCoverage,
} from "./grade-game";

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

test("gradeMarketFavorite marks correct when the market's favored side wins", () => {
  const result = gradeMarketFavorite(5.5, 110, 102); // home favored by 5.5, home wins
  assert.equal(result.correct, true);
});

test("gradeMarketFavorite marks incorrect when the market's underdog wins", () => {
  const result = gradeMarketFavorite(5.5, 100, 108); // home favored, away wins
  assert.equal(result.correct, false);
});

test("gradeMarketFavorite returns a neutral null with no market line or a pick'em", () => {
  assert.equal(gradeMarketFavorite(null, 110, 102).correct, null);
  assert.equal(gradeMarketFavorite(0, 110, 102).correct, null);
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

// Celtics -14.5 at home (market margin +14.5), we project them by only 6.4
// (margin +6.4) — our model favors the away side (Bulls) against that line.
test("gradeSpreadCoverage picks the away side when our margin is smaller than the market's favorite margin", () => {
  const correctCall = gradeSpreadCoverage(6.4, 14.5, 10); // Celtics win by 10, still short of -14.5 -> Bulls covered
  assert.equal(correctCall.correct, true);
  const incorrectCall = gradeSpreadCoverage(6.4, 14.5, 20); // Celtics blow it out -> Bulls did not cover
  assert.equal(incorrectCall.correct, false);
});

test("gradeSpreadCoverage returns a push (null) when there's no market line, or our pick or the result lands exactly on it", () => {
  assert.equal(gradeSpreadCoverage(6.4, null, 10).correct, null);
  assert.equal(gradeSpreadCoverage(14.5, 14.5, 10).correct, null);
  assert.equal(gradeSpreadCoverage(6.4, 14.5, 14.5).correct, null);
});

test("gradeTotalCoverage picks over/under relative to the market total", () => {
  assert.equal(gradeTotalCoverage(230, 220, 225).correct, true); // we picked over, game went over
  assert.equal(gradeTotalCoverage(230, 220, 215).correct, false); // we picked over, game went under
});

test("gradeTotalCoverage returns a push (null) when there's no market line, or our pick or the result lands exactly on it", () => {
  assert.equal(gradeTotalCoverage(230, null, 225).correct, null);
  assert.equal(gradeTotalCoverage(220, 220, 225).correct, null);
  assert.equal(gradeTotalCoverage(230, 220, 220).correct, null);
});
