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

test("projectGame lowers offense when a top scorer is unavailable", () => {
  const withoutTopScorer: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
    unavailableScorers: [{ recentPoints: [28, 30, 26, 29, 27] }],
  };
  const available: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
  };
  const opponent: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 110, oppPointsPerGame: 112 },
    recentGames: recentGames(5, 110, 112),
  };

  const withOut = projectGame(withoutTopScorer, opponent);
  const withAvailable = projectGame(available, opponent);
  assert.ok(withOut && withAvailable);
  assert.ok(
    withOut.projectedHomeScore < withAvailable.projectedHomeScore,
    `expected lower offense missing a top scorer: ${withOut.projectedHomeScore} vs ${withAvailable.projectedHomeScore}`,
  );
});

test("projectGame ignores a deep-bench player going unavailable", () => {
  const withBenchOut: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
    unavailableScorers: [{ recentPoints: [3, 4, 2, 5, 3] }],
  };
  const available: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
  };
  const opponent: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 110, oppPointsPerGame: 112 },
    recentGames: recentGames(5, 110, 112),
  };

  const withOut = projectGame(withBenchOut, opponent);
  const withAvailable = projectGame(available, opponent);
  assert.ok(withOut && withAvailable);
  assert.equal(withOut.projectedHomeScore, withAvailable.projectedHomeScore);
});

test("projectGame uses the opponent-adjusted rating over raw PPG when one is supplied", () => {
  // Same raw recent/season scoring for both teams, but home's
  // opponent-adjusted rating says it's actually the stronger offense
  // (beat tougher opponents) and away's says it's weaker — the rating
  // should move the projection, not just the raw PPG blend.
  const homeWithStrongRating: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
    rating: { recent: { offRating: 8, defRating: -4 }, season: { offRating: 6, defRating: -3 } },
    leagueAvgPoints: 112,
  };
  const awayWithWeakRating: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
    rating: { recent: { offRating: -8, defRating: 4 }, season: { offRating: -6, defRating: 3 } },
    leagueAvgPoints: 112,
  };
  const noRatingBaseline = projectGame(
    { seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 }, recentGames: recentGames(5, 112, 110) },
    { seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 }, recentGames: recentGames(5, 112, 110) },
  );
  const withRatings = projectGame(homeWithStrongRating, awayWithWeakRating);
  assert.ok(noRatingBaseline && withRatings);
  assert.ok(Math.abs(noRatingBaseline.projectedMargin) < 0.01, "identical raw inputs should project an even margin");
  assert.ok(
    withRatings.projectedMargin > noRatingBaseline.projectedMargin + 5,
    `expected the rating to meaningfully favor home, got margin ${withRatings.projectedMargin}`,
  );
});

test("projectGame falls back to the raw blend when leagueAvgPoints is missing", () => {
  const withRatingButNoLeagueAvg: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
    rating: { recent: { offRating: 20, defRating: -20 }, season: { offRating: 20, defRating: -20 } },
  };
  const plain: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(5, 112, 110),
  };
  const opponent: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 110, oppPointsPerGame: 112 },
    recentGames: recentGames(5, 110, 112),
  };
  const withRating = projectGame(withRatingButNoLeagueAvg, opponent);
  const withoutRating = projectGame(plain, opponent);
  assert.ok(withRating && withoutRating);
  assert.equal(withRating.projectedHomeScore, withoutRating.projectedHomeScore);
});

test("projectGame falls back to the season rating alone below the recent-games qualifying bar", () => {
  const belowQualifyingBar: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(2, 112, 110), // below MIN_RECENT_GAMES_FOR_BLEND (3)
    rating: { recent: { offRating: 20, defRating: -20 }, season: { offRating: 5, defRating: -2 } },
    leagueAvgPoints: 112,
  };
  const seasonRatingOnly: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 112, oppPointsPerGame: 110 },
    recentGames: recentGames(2, 112, 110),
    rating: { recent: null, season: { offRating: 5, defRating: -2 } },
    leagueAvgPoints: 112,
  };
  const opponent: TeamProjectionInput = {
    seasonStat: { pointsPerGame: 110, oppPointsPerGame: 112 },
    recentGames: recentGames(5, 110, 112),
  };

  const belowBar = projectGame(belowQualifyingBar, opponent);
  const seasonOnly = projectGame(seasonRatingOnly, opponent);
  assert.ok(belowBar && seasonOnly);
  // Below the qualifying bar, the (very different) recent rating should be
  // ignored entirely — same result as if only the season rating existed.
  assert.equal(belowBar.projectedHomeScore, seasonOnly.projectedHomeScore);
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
