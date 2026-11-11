import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAvailableCandidates } from "./king-of-the-court-candidates";

test("selectAvailableCandidates includes a player with no market prop (the function never consults odds at all)", () => {
  const candidates = selectAvailableCandidates([1, 2], 100, 10, 20, new Map());
  assert.deepEqual(candidates.map((c) => c.playerId).sort(), [1, 2]);
});

test("selectAvailableCandidates excludes a player frozen OUT for the game", () => {
  const availability = new Map([["100|2", "OUT" as const]]);
  const candidates = selectAvailableCandidates([1, 2], 100, 10, 20, availability);
  assert.deepEqual(candidates.map((c) => c.playerId), [1]);
});

test("selectAvailableCandidates includes a player flagged QUESTIONABLE/DOUBTFUL/PROBABLE, only excluding OUT", () => {
  const availability = new Map([
    ["100|1", "QUESTIONABLE" as const],
    ["100|2", "DOUBTFUL" as const],
    ["100|3", "PROBABLE" as const],
  ]);
  const candidates = selectAvailableCandidates([1, 2, 3], 100, 10, 20, availability);
  assert.deepEqual(candidates.map((c) => c.playerId).sort(), [1, 2, 3]);
});

test("selectAvailableCandidates attaches the opponent team id for every candidate", () => {
  const candidates = selectAvailableCandidates([1], 100, 10, 20, new Map());
  assert.deepEqual(candidates[0], { playerId: 1, currentTeamId: 10, opponentTeamId: 20 });
});
