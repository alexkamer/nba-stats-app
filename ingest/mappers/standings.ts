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
  divRecord: string | null;
  confRecord: string | null;
  lastTen: string | null;
}

/** The "expanded" standings view (viewId "1") carries a different set of
 * named records than the "overall" view (viewId "0") — same entry/team
 * shape, just different `records` content (confirmed against the real
 * ESPN core API: groups/{id}/standings/1). */
export interface ExpandedStandingInput {
  threePtRecord: string | null;
  tenPtRecord: string | null;
  vsOverRecord: string | null;
  vsUnderRecord: string | null;
  otRecord: string | null;
}

export function mapExpandedStanding(entry: EspnStandingsEntry): ExpandedStandingInput {
  return {
    threePtRecord: findRecord(entry, "Three Points")?.summary ?? null,
    tenPtRecord: findRecord(entry, "Ten Points")?.summary ?? null,
    vsOverRecord: findRecord(entry, "vs. .500 or Better")?.summary ?? null,
    vsUnderRecord: findRecord(entry, "vs. Below .500")?.summary ?? null,
    otRecord: findRecord(entry, "In Overtime Games")?.summary ?? null,
  };
}

/** The "division" standings view (viewId "2") carries records against each
 * conference and division (confirmed against the real ESPN core API:
 * groups/{id}/standings/2). */
export interface DivisionStandingInput {
  vsEastRecord: string | null;
  vsAtlRecord: string | null;
  vsCenRecord: string | null;
  vsSeRecord: string | null;
  vsWestRecord: string | null;
  vsNwRecord: string | null;
  vsPacRecord: string | null;
  vsSwRecord: string | null;
}

export function mapDivisionStanding(entry: EspnStandingsEntry): DivisionStandingInput {
  return {
    vsEastRecord: findRecord(entry, "vs. Eastern Conf.")?.summary ?? null,
    vsAtlRecord: findRecord(entry, "vs. Atlantic Div.")?.summary ?? null,
    vsCenRecord: findRecord(entry, "vs. Central Div.")?.summary ?? null,
    vsSeRecord: findRecord(entry, "vs. Southeast Div.")?.summary ?? null,
    vsWestRecord: findRecord(entry, "vs. Western Conf.")?.summary ?? null,
    vsNwRecord: findRecord(entry, "vs. Northwest Div.")?.summary ?? null,
    vsPacRecord: findRecord(entry, "vs. Pacific Div.")?.summary ?? null,
    vsSwRecord: findRecord(entry, "vs. Southwest Div.")?.summary ?? null,
  };
}

/** NBA Cup (In-Season Tournament) pool play, started 2023-24 (year 2024).
 * Fetched per-pool (groups 22-27 — "East/West Group A/B/C", see
 * sync-aggregates.ts) rather than per-conference, using the same
 * "inseason" view (viewId "3") that also exists at conference level; at
 * pool scope its "In Season" record is each team's pool-play-only
 * record (confirmed against the real ESPN core API), with "Home"/"Road"
 * records alongside it exactly like the main standings shape. */
export interface NbaCupStandingInput {
  seed: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  pointDifferential: number | null;
  streak: string | null;
}

export function mapNbaCupStanding(entry: EspnStandingsEntry): NbaCupStandingInput {
  const inSeason = findRecord(entry, "In Season");
  const streakValue = findStat(inSeason, "streak");
  return {
    seed: findStat(inSeason, "playoffSeed"),
    wins: findStat(inSeason, "wins"),
    losses: findStat(inSeason, "losses"),
    winPct: findStat(inSeason, "winPercent"),
    gamesBehind: findStat(inSeason, "gamesBehind"),
    homeRecord: findRecord(entry, "Home")?.summary ?? null,
    awayRecord: findRecord(entry, "Road")?.summary ?? null,
    pointsFor: findStat(inSeason, "pointsFor"),
    pointsAgainst: findStat(inSeason, "pointsAgainst"),
    pointDifferential: findStat(inSeason, "pointDifferential"),
    streak: streakValue !== null ? String(streakValue) : null,
  };
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
    divRecord: findRecord(entry, "vs. Div.")?.summary ?? null,
    confRecord: findRecord(entry, "vs. Conf.")?.summary ?? null,
    lastTen: findRecord(entry, "Last Ten Games")?.summary ?? null,
  };
}
