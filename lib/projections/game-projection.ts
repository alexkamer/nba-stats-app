/**
 * v1 projection methodology (design.md "recency-weighted statistical
 * baseline, not ML"): blend each team's season per-game scoring with a
 * recency-weighted recent-game average, then adjust for a home-court edge
 * derived from the same recent games (or a league-average fallback).
 * Deliberately simple and inspectable — see design.md for why.
 */

export interface TeamRecentGame {
  isHome: boolean;
  pointsFor: number;
  pointsAgainst: number;
}

export interface TeamSeasonSummary {
  pointsPerGame: number;
  oppPointsPerGame: number;
}

export interface TeamProjectionInput {
  seasonStat: TeamSeasonSummary | null;
  recentGames: TeamRecentGame[];
}

export interface GameProjectionResult {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedMargin: number; // home-team-relative, matching the Odds model's convention
}

// Below this many recent games, the recent-form sample is too noisy to
// blend in — fall back to season averages alone.
const MIN_RECENT_GAMES_FOR_BLEND = 3;
// How much weight recent form gets once there's enough of it.
const RECENT_FORM_WEIGHT = 0.6;
// Commonly-cited NBA home-court edge in points, used only when a team's
// own recent home/away split can't be computed.
const DEFAULT_HOME_COURT_EDGE = 2.0;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function blend(seasonValue: number | null, recentValues: number[]): number | null {
  const recentAvg = average(recentValues);
  if (recentAvg !== null && recentValues.length >= MIN_RECENT_GAMES_FOR_BLEND) {
    return seasonValue !== null ? RECENT_FORM_WEIGHT * recentAvg + (1 - RECENT_FORM_WEIGHT) * seasonValue : recentAvg;
  }
  return seasonValue;
}

function homeCourtEdge(home: TeamProjectionInput, away: TeamProjectionInput): number {
  const homeOwnEdge = splitHomeAwayMargin(home.recentGames);
  const awayOwnEdge = splitHomeAwayMargin(away.recentGames);
  if (homeOwnEdge !== null && awayOwnEdge !== null) return (homeOwnEdge + awayOwnEdge) / 2;
  return DEFAULT_HOME_COURT_EDGE;
}

/** A team's own "home games play better than away games" tendency, in
 * points, from its recent game log — null if it hasn't played enough of
 * both to say. */
function splitHomeAwayMargin(recentGames: TeamRecentGame[]): number | null {
  const homeMargins = recentGames.filter((g) => g.isHome).map((g) => g.pointsFor - g.pointsAgainst);
  const awayMargins = recentGames.filter((g) => !g.isHome).map((g) => g.pointsFor - g.pointsAgainst);
  const homeAvg = average(homeMargins);
  const awayAvg = average(awayMargins);
  if (homeAvg === null || awayAvg === null) return null;
  return (homeAvg - awayAvg) / 2;
}

/** Returns `null` when either team lacks qualifying history (no season
 * stat and no recent games) — never fabricates a projection. */
export function projectGame(home: TeamProjectionInput, away: TeamProjectionInput): GameProjectionResult | null {
  const homeOff = blend(home.seasonStat?.pointsPerGame ?? null, home.recentGames.map((g) => g.pointsFor));
  const homeDef = blend(home.seasonStat?.oppPointsPerGame ?? null, home.recentGames.map((g) => g.pointsAgainst));
  const awayOff = blend(away.seasonStat?.pointsPerGame ?? null, away.recentGames.map((g) => g.pointsFor));
  const awayDef = blend(away.seasonStat?.oppPointsPerGame ?? null, away.recentGames.map((g) => g.pointsAgainst));

  if (homeOff === null || homeDef === null || awayOff === null || awayDef === null) return null;

  const edge = homeCourtEdge(home, away);
  const projectedHomeScore = (homeOff + awayDef) / 2 + edge / 2;
  const projectedAwayScore = (awayOff + homeDef) / 2 - edge / 2;

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedMargin: projectedHomeScore - projectedAwayScore,
  };
}
