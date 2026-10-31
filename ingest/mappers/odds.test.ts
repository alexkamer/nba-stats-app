import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapCoreOdds, type EspnCoreOddsEntry } from "./odds";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreOddsFixture: EspnCoreOddsEntry = JSON.parse(
  readFileSync(join(__dirname, "../__fixtures__/core-odds.json"), "utf8"),
);

const GAME_ID = 1;
const HOME_TEAM_ID = 27; // Washington, the home underdog in the fixture
const AWAY_TEAM_ID = 30; // Charlotte, the away favorite in the fixture

test("mapCoreOdds maps current and open spread/overUnder/moneyline", () => {
  const result = mapCoreOdds(coreOddsFixture, GAME_ID, HOME_TEAM_ID, AWAY_TEAM_ID);
  assert.deepEqual(result, {
    gameId: GAME_ID,
    provider: "DraftKings",
    spread: 1.5,
    overUnder: 218.5,
    homeMoneyline: -105,
    awayMoneyline: -115,
    favoriteTeamId: AWAY_TEAM_ID,
    openSpread: 1.5,
    openOverUnder: 234.5,
    openHomeMoneyline: -105,
    openAwayMoneyline: -115,
    homeSpreadOdds: -112,
    awaySpreadOdds: -108,
    overOdds: -112,
    underOdds: -108,
  });
});

test("mapCoreOdds rounds the vig fields and returns null when absent", () => {
  const entry: EspnCoreOddsEntry = {
    provider: coreOddsFixture.provider,
    spread: 1.5,
    overUnder: 218.5,
    homeTeamOdds: { favorite: false, moneyLine: -105, spreadOdds: -111.6 },
    awayTeamOdds: { favorite: true, moneyLine: -115 },
  };
  const result = mapCoreOdds(entry, GAME_ID, HOME_TEAM_ID, AWAY_TEAM_ID);
  assert.equal(result.homeSpreadOdds, -112);
  assert.equal(result.awaySpreadOdds, null);
  assert.equal(result.overOdds, null);
  assert.equal(result.underOdds, null);
});

test("mapCoreOdds returns nulls for missing open-line fields instead of throwing", () => {
  const entry: EspnCoreOddsEntry = {
    provider: coreOddsFixture.provider,
    spread: 1.5,
    overUnder: 218.5,
    homeTeamOdds: { favorite: false, moneyLine: -105 },
    awayTeamOdds: { favorite: true, moneyLine: -115 },
  };
  const result = mapCoreOdds(entry, GAME_ID, HOME_TEAM_ID, AWAY_TEAM_ID);
  assert.equal(result.openSpread, null);
  assert.equal(result.openOverUnder, null);
  assert.equal(result.openHomeMoneyline, null);
  assert.equal(result.openAwayMoneyline, null);
  assert.equal(result.favoriteTeamId, AWAY_TEAM_ID);
});
