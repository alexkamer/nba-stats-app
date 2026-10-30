import { test } from "node:test";
import assert from "node:assert/strict";
import { projectGame, type TeamProjectionInput } from "./game-projection";

function recentGames(count: number, pointsFor: number, pointsAgainst: number): TeamProjectionInput["recentGames"] {
  return Array.from({ length: count }, (_, i) => ({ isHome: i % 2 === 0, pointsFor, pointsAgainst }));
}

test("projectGame favors the clearly better team by a wide margin", () => {
  const strongHome: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 120, oppPointsPerGame: 105 },
    recentGames: recentGames(5, 122, 103),
  };
  const weakAway: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 105, oppPointsPerGame: 118 },
    recentGames: recentGames(5, 103, 120),
  };
  const result = projectGame(strongHome, weakAway);
  assert.ok(result);
  assert.ok(result.projectedMargin > 10, `expected a lopsided margin, got ${result.projectedMargin}`);
});

test("projectGame produces a near-even margin for two similar teams", () => {
  const teamA: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 111 },
    recentGames: recentGames(5, 112, 111),
  };
  const teamB: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 111, oppPointsPerGame: 112 },
    recentGames: recentGames(5, 111, 112),
  };
  const result = projectGame(teamA, teamB);
  assert.ok(result);
  assert.ok(Math.abs(result.projectedMargin) < 6, `expected a close margin, got ${result.projectedMargin}`);
});

test("projectGame returns null when a team has no season stat and no recent games", () => {
  const noHistory: TeamProjectionInput = { seasonStat: null, recentGames: [] };
  const hasHistory: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 108 },
    recentGames: recentGames(5, 112, 108),
  };
  assert.equal(projectGame(noHistory, hasHistory), null);
  assert.equal(projectGame(hasHistory, noHistory), null);
});
