// Shapes confirmed against ingest/__fixtures__/summary.json during M4
// exploration. ESPN reports some team stats as combined "made-attempted"
// display strings (e.g. "46-86") rather than separate numeric fields.

export interface EspnTeamStat {
  name: string;
  displayValue: string;
}

export interface EspnBoxscoreTeam {
  team: { id: string };
  statistics: EspnTeamStat[];
}

export interface EspnBoxscoreAthleteEntry {
  athlete: {
    id: string;
    displayName: string;
    headshot?: { href: string };
    jersey?: string;
    position?: { name: string; abbreviation: string };
  };
  didNotPlay?: boolean;
  stats: string[];
}

export interface EspnBoxscorePlayerGroup {
  team: { id: string };
  statistics: { keys: string[]; athletes: EspnBoxscoreAthleteEntry[] }[];
}

export interface EspnBoxscore {
  teams: EspnBoxscoreTeam[];
  players: EspnBoxscorePlayerGroup[];
}

export interface TeamGameStatInput {
  gameId: number;
  teamId: number;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  threeMade: number | null;
  threeAtt: number | null;
  ftMade: number | null;
  ftAtt: number | null;
}

export interface PlayerGameStatInput {
  gameId: number;
  playerId: number;
  teamId: number;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  threeMade: number | null;
  threeAtt: number | null;
  ftMade: number | null;
  ftAtt: number | null;
  plusMinus: number | null;
}

function splitMadeAtt(displayValue: string | undefined): [number | null, number | null] {
  if (!displayValue || !displayValue.includes("-")) return [null, null];
  const [made, att] = displayValue.split("-").map(Number);
  return [Number.isFinite(made) ? made : null, Number.isFinite(att) ? att : null];
}

function statValue(stats: EspnTeamStat[], name: string): string | undefined {
  return stats.find((s) => s.name === name)?.displayValue;
}

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapTeamGameStat(
  teamStat: EspnBoxscoreTeam,
  gameId: number,
  teamId: number,
  points: number | null,
): TeamGameStatInput {
  const stats = teamStat.statistics;
  const [fgMade, fgAtt] = splitMadeAtt(statValue(stats, "fieldGoalsMade-fieldGoalsAttempted"));
  const [threeMade, threeAtt] = splitMadeAtt(
    statValue(stats, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
  );
  const [ftMade, ftAtt] = splitMadeAtt(statValue(stats, "freeThrowsMade-freeThrowsAttempted"));

  return {
    gameId,
    teamId,
    points,
    rebounds: toNumberOrNull(statValue(stats, "totalRebounds")),
    assists: toNumberOrNull(statValue(stats, "assists")),
    steals: toNumberOrNull(statValue(stats, "steals")),
    blocks: toNumberOrNull(statValue(stats, "blocks")),
    turnovers: toNumberOrNull(statValue(stats, "turnovers")),
    fouls: toNumberOrNull(statValue(stats, "fouls")),
    fgMade,
    fgAtt,
    threeMade,
    threeAtt,
    ftMade,
    ftAtt,
  };
}

/** Maps one athlete's parallel `stats` array (ordered per `keys`) into a
 * named record, e.g. { minutes: "17", points: "6", ... }. */
function zipStats(keys: string[], values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  keys.forEach((key, i) => {
    result[key] = values[i];
  });
  return result;
}

export function mapPlayerGameStat(
  entry: EspnBoxscoreAthleteEntry,
  keys: string[],
  gameId: number,
  playerId: number,
  teamId: number,
): PlayerGameStatInput {
  if (entry.didNotPlay || !entry.stats?.length) {
    return {
      gameId,
      playerId,
      teamId,
      minutes: 0,
      points: null,
      rebounds: null,
      assists: null,
      steals: null,
      blocks: null,
      turnovers: null,
      fouls: null,
      fgMade: null,
      fgAtt: null,
      threeMade: null,
      threeAtt: null,
      ftMade: null,
      ftAtt: null,
      plusMinus: null,
    };
  }

  const byKey = zipStats(keys, entry.stats);
  const [fgMade, fgAtt] = splitMadeAtt(byKey["fieldGoalsMade-fieldGoalsAttempted"]);
  const [threeMade, threeAtt] = splitMadeAtt(byKey["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]);
  const [ftMade, ftAtt] = splitMadeAtt(byKey["freeThrowsMade-freeThrowsAttempted"]);

  return {
    gameId,
    playerId,
    teamId,
    minutes: toNumberOrNull(byKey["minutes"]),
    points: toNumberOrNull(byKey["points"]),
    rebounds: toNumberOrNull(byKey["rebounds"]),
    assists: toNumberOrNull(byKey["assists"]),
    steals: toNumberOrNull(byKey["steals"]),
    blocks: toNumberOrNull(byKey["blocks"]),
    turnovers: toNumberOrNull(byKey["turnovers"]),
    fouls: toNumberOrNull(byKey["fouls"]),
    fgMade,
    fgAtt,
    threeMade,
    threeAtt,
    ftMade,
    ftAtt,
    plusMinus: toNumberOrNull(byKey["plusMinus"]),
  };
}
