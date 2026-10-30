import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapPlayerPropBets, type EspnPropBetItem } from "./player-props";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture: EspnPropBetItem[] = JSON.parse(
  readFileSync(join(__dirname, "../__fixtures__/prop-bets.json"), "utf8"),
);

const GAME_ID = 1;
const PLAYER_ID_BY_ESPN_ID = new Map([
  ["6583", 100],
  ["9999", 200],
]);

test("mapPlayerPropBets pairs Over/Under positionally and drops disallowed prop types", () => {
  const result = mapPlayerPropBets(fixture, GAME_ID, PLAYER_ID_BY_ESPN_ID, "DraftKings");

  // 2 allowlisted groups (athlete 6583 and 9999, both "Total Points") x 2
  // sides each = 4 rows; the "Points Milestones" entry is dropped entirely.
  assert.equal(result.length, 4);
  assert.ok(result.every((r) => r.statType === "POINTS"));

  const athlete1 = result.filter((r) => r.playerId === 100);
  assert.equal(athlete1.length, 2);
  assert.equal(athlete1[0].side, "OVER");
  assert.equal(athlete1[0].odds, -119);
  assert.equal(athlete1[0].openOdds, -115);
  assert.equal(athlete1[0].line, 20.5);
  assert.equal(athlete1[0].openLine, 21.5);
  assert.equal(athlete1[1].side, "UNDER");
  assert.equal(athlete1[1].odds, -107);
});

test("mapPlayerPropBets skips athletes not in the known-player map", () => {
  const result = mapPlayerPropBets(fixture, GAME_ID, new Map(), "DraftKings");
  assert.equal(result.length, 0);
});
