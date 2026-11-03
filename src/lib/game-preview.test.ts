import { test } from "node:test";
import assert from "node:assert/strict";
import { pickStartingFive, groupAvailabilityByTeam, buildPlayerPropLeans } from "./game-preview";
import type { DepthChartPosition } from "./espn-team-depth-chart";

test("pickStartingFive takes the rank-1 athlete from each position", () => {
  const depthChart: DepthChartPosition[] = [
    { abbreviation: "PG", athleteEspnIdsByRank: ["1", "11"] },
    { abbreviation: "SG", athleteEspnIdsByRank: ["2", "12"] },
    { abbreviation: "SF", athleteEspnIdsByRank: ["3"] },
    { abbreviation: "PF", athleteEspnIdsByRank: ["4", "14"] },
    { abbreviation: "C", athleteEspnIdsByRank: ["5"] },
  ];
  assert.deepEqual(pickStartingFive(depthChart), ["1", "2", "3", "4", "5"]);
});

test("pickStartingFive skips a position with no ranked athletes and returns an empty list for an empty depth chart", () => {
  const depthChart: DepthChartPosition[] = [
    { abbreviation: "PG", athleteEspnIdsByRank: [] },
    { abbreviation: "SG", athleteEspnIdsByRank: ["2"] },
  ];
  assert.deepEqual(pickStartingFive(depthChart), ["2"]);
  assert.deepEqual(pickStartingFive([]), []);
});

test("groupAvailabilityByTeam splits rows by the player's current team", () => {
  const rows = [
    { playerId: 1, status: "OUT", comment: "Ankle", player: { displayName: "A Player", currentTeamId: 10 } },
    { playerId: 2, status: "QUESTIONABLE", comment: null, player: { displayName: "B Player", currentTeamId: 20 } },
    { playerId: 3, status: "AVAILABLE", comment: null, player: { displayName: "C Player", currentTeamId: 10 } },
  ];
  const result = groupAvailabilityByTeam(rows, 10, 20);
  assert.deepEqual(result.home.map((r) => r.playerId), [1, 3]);
  assert.deepEqual(result.away.map((r) => r.playerId), [2]);
  assert.equal(result.home[0].status, "OUT");
  assert.equal(result.home[0].comment, "Ankle");
});

test("groupAvailabilityByTeam returns empty arrays when no rows match either team", () => {
  const result = groupAvailabilityByTeam([], 10, 20);
  assert.deepEqual(result, { home: [], away: [] });
});

test("buildPlayerPropLeans computes an OVER lean and matches its odds row", () => {
  const projections = [
    { playerId: 1, statType: "POINTS", line: 24.5, projectedValue: 27.1, player: { displayName: "A Player" } },
  ];
  const odds = [
    { playerId: 1, statType: "POINTS", side: "OVER", odds: -115 },
    { playerId: 1, statType: "POINTS", side: "UNDER", odds: -105 },
  ];
  const result = buildPlayerPropLeans(projections, odds);
  assert.deepEqual(result, [
    { playerId: 1, playerName: "A Player", statType: "POINTS", projectedValue: 27.1, line: 24.5, lean: "OVER", odds: -115 },
  ]);
});

test("buildPlayerPropLeans computes an UNDER lean and a PUSH when projection equals the line", () => {
  const under = buildPlayerPropLeans(
    [{ playerId: 2, statType: "ASSISTS", line: 8, projectedValue: 6.2, player: { displayName: "B Player" } }],
    [],
  );
  assert.equal(under[0].lean, "UNDER");
  assert.equal(under[0].odds, null);

  const push = buildPlayerPropLeans(
    [{ playerId: 3, statType: "REBOUNDS", line: 10, projectedValue: 10, player: { displayName: "C Player" } }],
    [],
  );
  assert.equal(push[0].lean, "PUSH");
});

test("buildPlayerPropLeans omits projections with no published line", () => {
  const result = buildPlayerPropLeans(
    [{ playerId: 4, statType: "STEALS", line: null, projectedValue: 1.5, player: { displayName: "D Player" } }],
    [],
  );
  assert.deepEqual(result, []);
});
