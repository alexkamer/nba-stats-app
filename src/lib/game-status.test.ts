import { test } from "node:test";
import assert from "node:assert/strict";
import { isBreak, isUnderway } from "./game-status";

test("a game with the clock running is underway and not on a break", () => {
  assert.equal(isUnderway("STATUS_IN_PROGRESS"), true);
  assert.equal(isBreak("STATUS_IN_PROGRESS"), false);
});

test("halftime and the end of a period are underway, and are breaks", () => {
  for (const status of ["STATUS_HALFTIME", "STATUS_END_PERIOD"]) {
    assert.equal(isUnderway(status), true, status);
    assert.equal(isBreak(status), true, status);
  }
});

test("scheduled and final games are not underway", () => {
  for (const status of ["STATUS_SCHEDULED", "STATUS_FINAL", "STATUS_POSTPONED", "STATUS_CANCELED"]) {
    assert.equal(isUnderway(status), false, status);
    assert.equal(isBreak(status), false, status);
  }
});
