import { test } from "node:test";
import assert from "node:assert/strict";
import { toDateKey, parseDateKey, shiftDateKey, isFutureKey, todayKey } from "./date";

test("toDateKey formats local date as YYYY-MM-DD", () => {
  assert.equal(toDateKey(new Date(2026, 10, 5)), "2026-11-05");
});

test("parseDateKey round-trips a valid key", () => {
  const date = parseDateKey("2026-11-05");
  assert.ok(date);
  assert.equal(toDateKey(date!), "2026-11-05");
});

test("parseDateKey rejects a malformed key", () => {
  assert.equal(parseDateKey("11/05/2026"), null);
});

test("parseDateKey rejects a calendar-invalid date instead of rolling over", () => {
  assert.equal(parseDateKey("2026-02-30"), null);
});

test("shiftDateKey moves forward and backward by whole days", () => {
  assert.equal(shiftDateKey("2026-11-05", 1), "2026-11-06");
  assert.equal(shiftDateKey("2026-11-05", -1), "2026-11-04");
});

test("shiftDateKey crosses a month boundary", () => {
  assert.equal(shiftDateKey("2026-11-30", 1), "2026-12-01");
});

test("isFutureKey is false for today and true for tomorrow", () => {
  const today = todayKey();
  assert.equal(isFutureKey(today), false);
  assert.equal(isFutureKey(shiftDateKey(today, 1)!), true);
});
