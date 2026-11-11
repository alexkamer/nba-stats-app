import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionsForDate } from "./sections";

test("today includes current-moment sections and excludes the past slate", () => {
  const s = sectionsForDate("2026-11-10", "2026-11-10");
  assert.equal(s.isToday, true);
  assert.equal(s.headlines, true);
  assert.equal(s.injuries, true);
  assert.equal(s.standings, true);
  assert.equal(s.schedule, true);
  assert.equal(s.pastSlate, false);
});

test("a past date excludes current-moment sections and includes the past slate", () => {
  const s = sectionsForDate("2026-11-05", "2026-11-10");
  assert.equal(s.isToday, false);
  assert.equal(s.headlines, false);
  assert.equal(s.injuries, false);
  assert.equal(s.standings, false);
  assert.equal(s.schedule, false);
  assert.equal(s.pastSlate, true);
});

test("date-scoped sections always apply", () => {
  for (const key of ["2026-11-05", "2026-11-10"]) {
    const s = sectionsForDate(key, "2026-11-10");
    assert.equal(s.scores, true);
    assert.equal(s.topPerformers, true);
    assert.equal(s.bestBets, true);
  }
});
