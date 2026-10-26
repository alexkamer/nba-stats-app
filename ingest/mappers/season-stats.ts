// Shapes confirmed against real ESPN core-API calls during M5 exploration:
// sports.core.api.../seasons/{year}/types/{type}/teams/{id}/statistics and
// .../athletes/{id}/statistics. Both return the same categories/stats shape
// (defensive/general/offensive), with per-game "avg*" fields alongside
// season totals. Scope: REGULAR season only (SPEC.md Sec 6 — season stats
// pages mean regular-season averages; standings only make sense for the
// regular season too).

export interface EspnStatValue {
  name: string;
  value: number;
}

export interface EspnStatCategory {
  name: string;
  stats: EspnStatValue[];
}

export interface EspnStatisticsResponse {
  splits: { categories: EspnStatCategory[] };
}

function findStat(categories: EspnStatCategory[], name: string): number | null {
  for (const cat of categories) {
    const stat = cat.stats.find((s) => s.name === name);
    if (stat) return stat.value;
  }
  return null;
}

export interface TeamSeasonStatInput {
  teamId: number;
  seasonId: number;
  wins: number | null;
  losses: number | null;
  pointsPerGame: number | null;
  oppPointsPerGame: number | null;
  extra: string;
}

/** `standingsWinsLosses` comes from the standings call (team-statistics has
 * no win/loss field at all); the rest comes from team-statistics. */
export function mapTeamSeasonStat(
  stats: EspnStatisticsResponse,
  teamId: number,
  seasonId: number,
  standingsWinsLosses: { wins: number; losses: number; avgPointsFor: number; avgPointsAgainst: number },
): TeamSeasonStatInput {
  return {
    teamId,
    seasonId,
    wins: standingsWinsLosses.wins,
    losses: standingsWinsLosses.losses,
    pointsPerGame: standingsWinsLosses.avgPointsFor,
    oppPointsPerGame: standingsWinsLosses.avgPointsAgainst,
    extra: JSON.stringify(stats.splits.categories),
  };
}

export interface PlayerSeasonStatInput {
  playerId: number;
  teamId: number;
  seasonId: number;
  gamesPlayed: number | null;
  pointsPerGame: number | null;
  reboundsPerGame: number | null;
  assistsPerGame: number | null;
  stealsPerGame: number | null;
  blocksPerGame: number | null;
  turnoversPerGame: number | null;
  fieldGoalPct: number | null;
  threePointPct: number | null;
  freeThrowPct: number | null;
  extra: string;
}

export function mapPlayerSeasonStat(
  stats: EspnStatisticsResponse,
  playerId: number,
  teamId: number,
  seasonId: number,
): PlayerSeasonStatInput {
  const categories = stats.splits.categories;
  return {
    playerId,
    teamId,
    seasonId,
    gamesPlayed: findStat(categories, "gamesPlayed"),
    pointsPerGame: findStat(categories, "avgPoints"),
    reboundsPerGame: findStat(categories, "avgRebounds"),
    assistsPerGame: findStat(categories, "avgAssists"),
    stealsPerGame: findStat(categories, "avgSteals"),
    blocksPerGame: findStat(categories, "avgBlocks"),
    turnoversPerGame: findStat(categories, "avgTurnovers"),
    fieldGoalPct: findStat(categories, "fieldGoalPct"),
    threePointPct: findStat(categories, "threePointPct"),
    freeThrowPct: findStat(categories, "freeThrowPct"),
    extra: JSON.stringify(categories),
  };
}
