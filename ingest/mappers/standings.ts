// Shapes confirmed against real ESPN core-API calls during M5 exploration:
// sports.core.api.../seasons/{year}/types/{type}/groups/{groupId}/standings/0
// (the "overall" view — a two-step $ref fetch, discovered in M2). Each
// team's entry carries several named "records" (overall/Home/Road/vs.
// Div./vs. Conf./Last Ten Games), each with its own `stats` array.

export interface EspnStandingsRecord {
  name: string;
  summary: string;
  stats: { name: string; value: number }[];
}

export interface EspnStandingsEntry {
  team: { $ref: string };
  records: EspnStandingsRecord[];
}

export interface EspnStandingsResponse {
  standings: EspnStandingsEntry[];
}

function findRecord(entry: EspnStandingsEntry, name: string): EspnStandingsRecord | undefined {
  return entry.records.find((r) => r.name === name);
}

function findStat(record: EspnStandingsRecord | undefined, name: string): number | null {
  const stat = record?.stats.find((s) => s.name === name);
  return stat?.value ?? null;
}

export interface TeamRecordSummary {
  wins: number;
  losses: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
}

export function extractOverallRecord(entry: EspnStandingsEntry): TeamRecordSummary {
  const overall = findRecord(entry, "overall");
  return {
    wins: findStat(overall, "wins") ?? 0,
    losses: findStat(overall, "losses") ?? 0,
    avgPointsFor: findStat(overall, "avgPointsFor") ?? 0,
    avgPointsAgainst: findStat(overall, "avgPointsAgainst") ?? 0,
  };
}

export interface StandingUpsertInput {
  teamId: number;
  seasonId: number;
  conferenceRank: number | null;
  divisionRank: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
  lastTen: string | null;
}

/** The `standings` array's order is NOT rank order (confirmed during M5 —
 * e.g. the league's best record showed up at array position 15). ESPN
 * reports conference rank explicitly as the `playoffSeed` stat on each
 * team's overall record; use that instead of array position. */
export function conferenceRankOf(entry: EspnStandingsEntry): number | null {
  const overall = findRecord(entry, "overall");
  return findStat(overall, "playoffSeed");
}

export function mapStanding(
  entry: EspnStandingsEntry,
  teamId: number,
  seasonId: number,
  conferenceRank: number | null,
  divisionRank: number | null,
): StandingUpsertInput {
  const overall = findRecord(entry, "overall");
  const streakValue = findStat(overall, "streak");

  return {
    teamId,
    seasonId,
    conferenceRank,
    divisionRank,
    wins: findStat(overall, "wins"),
    losses: findStat(overall, "losses"),
    winPct: findStat(overall, "winPercent"),
    gamesBehind: findStat(overall, "gamesBehind"),
    streak: streakValue !== null ? String(streakValue) : null,
    homeRecord: findRecord(entry, "Home")?.summary ?? null,
    awayRecord: findRecord(entry, "Road")?.summary ?? null,
    lastTen: findRecord(entry, "Last Ten Games")?.summary ?? null,
  };
}
