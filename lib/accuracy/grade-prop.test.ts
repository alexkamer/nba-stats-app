import { test } from "node:test";
import assert from "node:assert/strict";
import { gradePlayerProp } from "./grade-prop";

test("gradePlayerProp marks an over lean correct when the actual value clears the line", () => {
  assert.equal(gradePlayerProp(24, 20.5, 28).correct, true);
});

test("gradePlayerProp marks an over lean incorrect when the actual value falls short", () => {
  assert.equal(gradePlayerProp(24, 20.5, 15).correct, false);
});

test("gradePlayerProp marks an under lean correct when the actual value stays below the line", () => {
  assert.equal(gradePlayerProp(16, 20.5, 14).correct, true);
});

test("gradePlayerProp returns a push (null) when the actual value lands exactly on the line", () => {
  assert.equal(gradePlayerProp(24, 20, 20).correct, null);
});

test("gradePlayerProp returns a push (null) when the projection itself has no lean", () => {
  assert.equal(gradePlayerProp(20.5, 20.5, 25).correct, null);
});
