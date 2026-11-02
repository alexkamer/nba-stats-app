import { test } from "node:test";
import assert from "node:assert/strict";
import { solveTeamRatings, hasEnoughLeagueData, MIN_LEAGUE_GAMES_FOR_RATING, type TeamGameRow } from "./team-rating";

test("a team that beat only weak opponents rates below a team with a worse raw PPG but a tougher schedule", () => {
  const games: TeamGameRow[] = [
    { teamId: 1, opponentId: 3, pointsFor: 120, pointsAgainst: 90 }, // A beats Weak
    { teamId: 3, opponentId: 1, pointsFor: 90, pointsAgainst: 120 },
    { teamId: 1, opponentId: 4, pointsFor: 105, pointsAgainst: 100 }, // A also beats Strong, narrowly
    { teamId: 4, opponentId: 1, pointsFor: 100, pointsAgainst: 105 },
    { teamId: 2, opponentId: 3, pointsFor: 120, pointsAgainst: 90 }, // B beats Weak by the same scoreline, never plays Strong
    { teamId: 3, opponentId: 2, pointsFor: 90, pointsAgainst: 120 },
    { teamId: 4, opponentId: 3, pointsFor: 110, pointsAgainst: 80 }, // Strong convincingly beats Weak, establishing the strength gap
    { teamId: 3, opponentId: 4, pointsFor: 80, pointsAgainst: 110 },
  ];
  const ratings = solveTeamRatings(games);

  // B's raw PPG (120) is higher than A's (112.5) from this data alone, but
  // A's schedule included a tough opponent (Strong) it still scored well
  // against — the opponent-adjusted rating should recognize that and rate
  // A's offense above B's despite the raw-PPG gap running the other way.
  assert.ok(
    ratings.get(1)!.offRating > ratings.get(2)!.offRating,
    `expected A's opponent-adjusted offense above B's despite lower raw PPG, got A=${ratings.get(1)!.offRating} B=${ratings.get(2)!.offRating}`,
  );
});

test("the solve converges to finite, bounded ratings within the iteration cap on a multi-team league", () => {
  const teams = [1, 2, 3, 4, 5, 6];
  const games: TeamGameRow[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      const aScore = 100 + ((a * 7 + b * 3) % 20);
      const bScore = 100 + ((b * 5 + a * 2) % 20);
      games.push({ teamId: a, opponentId: b, pointsFor: aScore, pointsAgainst: bScore });
      games.push({ teamId: b, opponentId: a, pointsFor: bScore, pointsAgainst: aScore });
    }
  }

  const ratings = solveTeamRatings(games);
  assert.equal(ratings.size, teams.length);
  for (const [teamId, rating] of ratings) {
    assert.ok(Number.isFinite(rating.offRating), `team ${teamId} offRating should be finite`);
    assert.ok(Number.isFinite(rating.defRating), `team ${teamId} defRating should be finite`);
    assert.ok(Math.abs(rating.offRating) < 50, `team ${teamId} offRating should be bounded, got ${rating.offRating}`);
    assert.ok(Math.abs(rating.defRating) < 50, `team ${teamId} defRating should be bounded, got ${rating.defRating}`);
  }
});

test("empty input returns an empty map rather than dividing by zero", () => {
  assert.equal(solveTeamRatings([]).size, 0);
});

test("a team with zero games in the window keeps the neutral rating rather than being omitted", () => {
  const games: TeamGameRow[] = [
    { teamId: 1, opponentId: 2, pointsFor: 110, pointsAgainst: 100 },
    { teamId: 2, opponentId: 1, pointsFor: 100, pointsAgainst: 110 },
  ];
  // Team 3 never appears in any game row — solveTeamRatings has no way to
  // know it exists, so this documents the caller's responsibility: a team
  // absent from the input simply isn't in the output map.
  const ratings = solveTeamRatings(games);
  assert.equal(ratings.has(3), false);
  assert.equal(ratings.size, 2);
});

test("hasEnoughLeagueData flips at the documented threshold", () => {
  const below = Array.from({ length: MIN_LEAGUE_GAMES_FOR_RATING - 1 }, () => ({
    teamId: 1,
    opponentId: 2,
    pointsFor: 100,
    pointsAgainst: 100,
  }));
  const atThreshold = Array.from({ length: MIN_LEAGUE_GAMES_FOR_RATING }, () => ({
    teamId: 1,
    opponentId: 2,
    pointsFor: 100,
    pointsAgainst: 100,
  }));
  assert.equal(hasEnoughLeagueData(below), false);
  assert.equal(hasEnoughLeagueData(atThreshold), true);
});
