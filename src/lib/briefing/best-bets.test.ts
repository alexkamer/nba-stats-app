import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRecord } from "./best-bets";

test("summarizeRecord counts wins and losses, excluding pushes", () => {
  const record = summarizeRecord([true, true, false, null, true, false]);
  assert.deepEqual(record, { wins: 3, losses: 2, record: "3-2" });
});

test("summarizeRecord returns null when nothing is decided yet", () => {
  assert.equal(summarizeRecord([null, null]), null);
  assert.equal(summarizeRecord([]), null);
});

test("summarizeRecord handles an all-win record", () => {
  assert.deepEqual(summarizeRecord([true, true]), { wins: 2, losses: 0, record: "2-0" });
});
