/**
 * League-wide opponent-adjusted team ratings (design.md "Rating methodology:
 * league-wide iterative offense/defense solve (SRS-style), not Elo").
 * Pure, no DB access — same "derive strength from already-ingested game
 * data" idea as `opponent-factor.ts`, but iteratively solved across every
 * team at once instead of a single-pass league-average-relative multiplier,
 * and split into offense/defense so a projected score (not just a margin)
 * stays derivable.
 */

export interface TeamGameRow {
  teamId: number;
  opponentId: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface TeamRating {
  /** Points above (positive) or below (negative) league average this
   * team's offense is worth, adjusted for the defenses it actually
   * faced. */
  offRating: number;
  /** Points above (positive, worse) or below (negative, better) league
   * average this team allows, adjusted for the offenses it actually
   * faced. */
  defRating: number;
}

// Fixed-point iteration stops once no rating moves by more than this
// between passes, or at the iteration cap below — whichever comes first.
const CONVERGENCE_THRESHOLD = 0.05;
const MAX_ITERATIONS = 20;

// Below this many total league games, the opponent-strength signal feeding
// the solve is itself too thin to trust (design.md "Graceful degradation") —
// callers should fall back to an unadjusted blend instead of using ratings
// from a call below this bar.
export const MIN_LEAGUE_GAMES_FOR_RATING = 20;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** `true` once there are enough league-wide games for `solveTeamRatings`'s
 * opponent-adjustment to be meaningful rather than noise. */
export function hasEnoughLeagueData(games: TeamGameRow[]): boolean {
  return games.length >= MIN_LEAGUE_GAMES_FOR_RATING;
}

/** Solves offensive/defensive ratings for every team appearing in `games`
 * by fixed-point iteration. Returns an empty map for an empty input —
 * never fabricates a rating with no data. A team with zero games (e.g.
 * present in the league but not in this particular window) keeps the
 * neutral `{ offRating: 0, defRating: 0 }` it's initialized with. */
export function solveTeamRatings(games: TeamGameRow[]): Map<number, TeamRating> {
  const ratings = new Map<number, TeamRating>();
  if (games.length === 0) return ratings;

  const leagueAvgPoints = average(games.map((g) => g.pointsFor));
  if (leagueAvgPoints === null) return ratings;

  const teamIds = new Set<number>();
  const gamesByTeam = new Map<number, TeamGameRow[]>();
  for (const game of games) {
    teamIds.add(game.teamId);
    teamIds.add(game.opponentId);
    const list = gamesByTeam.get(game.teamId);
    if (list) list.push(game);
    else gamesByTeam.set(game.teamId, [game]);
  }
  for (const teamId of teamIds) ratings.set(teamId, { offRating: 0, defRating: 0 });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const next = new Map<number, TeamRating>();
    let maxDelta = 0;

    for (const teamId of teamIds) {
      const teamGames = gamesByTeam.get(teamId) ?? [];
      const previous = ratings.get(teamId)!;
      if (teamGames.length === 0) {
        next.set(teamId, previous);
        continue;
      }

      const offSum = teamGames.reduce(
        (sum, g) => sum + (g.pointsFor - (ratings.get(g.opponentId)?.defRating ?? 0)),
        0,
      );
      const defSum = teamGames.reduce(
        (sum, g) => sum + (g.pointsAgainst - (ratings.get(g.opponentId)?.offRating ?? 0)),
        0,
      );
      const offRating = offSum / teamGames.length - leagueAvgPoints;
      const defRating = defSum / teamGames.length - leagueAvgPoints;

      maxDelta = Math.max(maxDelta, Math.abs(offRating - previous.offRating), Math.abs(defRating - previous.defRating));
      next.set(teamId, { offRating, defRating });
    }

    for (const [teamId, rating] of next) ratings.set(teamId, rating);
    if (maxDelta < CONVERGENCE_THRESHOLD) break;
  }

  return ratings;
}
