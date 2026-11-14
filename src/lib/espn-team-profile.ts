// Espn-only equivalent of /api/teams/[teamId]. Simplifications vs. the DB
// path (documented in docs/DATA_SOURCES.md): no season history (current
// season only), no stat-splits dropdown (needs per-game box scores), no
// news (needs a local team<->article join), and schedule rows have no
// per-game Hi Points/Rebounds/Assists leaders or odds (never ingested
// without a DB).
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints } from "@espn/endpoints";
import { mapPlayerSeasonStat, mapTeamSeasonStat, type EspnStatisticsResponse } from "../../ingest/mappers/season-stats";
import { cachedEspn } from "./espn-cache";
import { isUnderway } from "./game-status";
import { currentSeasonYear, REGULAR_SEASON_TYPE } from "./espn-season";
import { getActivePlayersLive, type LivePlayer } from "./espn-players-list";
import { getStandingsLive, getNbaCupStandingsLive } from "./espn-standings-live";
import { getTeamsLive, type LiveTeam } from "./espn-teams-list";
import { getTeamCoach } from "./espn-team-coach";
import { getTeamDepthChart } from "./espn-team-depth-chart";
import { getTeamInjuries } from "./espn-team-injuries";
import { getTeamLeaders } from "./espn-team-leaders";

const LEADER_CATEGORY_DEFS = [
  { group: "offense" as const, key: "pointsPerGame" },
  { group: "offense" as const, key: "assistsPerGame" },
  { group: "offense" as const, key: "fieldGoalPercentage" },
  { group: "defense" as const, key: "reboundsPerGame" },
  { group: "defense" as const, key: "stealsPerGame" },
  { group: "defense" as const, key: "blocksPerGame" },
];

interface EspnScheduleTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  logos?: { href: string; rel: string[] }[];
}
interface EspnScheduleEvent {
  id: string;
  date: string;
  competitions: {
    status: { type: { name: string; completed: boolean } };
    competitors: { homeAway: "home" | "away"; score?: string; team: EspnScheduleTeam }[];
  }[];
}
interface EspnScheduleResponse {
  events?: EspnScheduleEvent[];
}

function findStat(extraJson: string, statName: string): string | null {
  try {
    const categories = JSON.parse(extraJson) as { stats?: { name: string; displayValue?: string }[] }[];
    for (const category of categories) {
      const stat = category.stats?.find((s) => s.name === statName);
      if (stat?.displayValue) return stat.displayValue;
    }
  } catch {
    return null;
  }
  return null;
}

function findStatNumber(extraJson: string, statName: string): number | null {
  const value = findStat(extraJson, statName);
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function buildFullStat(extra: string) {
  return {
    gamesStarted: findStatNumber(extra, "gamesStarted"),
    minutesPerGame: findStatNumber(extra, "avgMinutes"),
    offReboundsPerGame: findStatNumber(extra, "avgOffensiveRebounds"),
    defReboundsPerGame: findStatNumber(extra, "avgDefensiveRebounds"),
    foulsPerGame: findStatNumber(extra, "avgFouls"),
    assistTurnoverRatio: findStatNumber(extra, "assistTurnoverRatio"),
    fgMadePerGame: findStatNumber(extra, "avgFieldGoalsMade"),
    fgAttPerGame: findStatNumber(extra, "avgFieldGoalsAttempted"),
    threeMadePerGame: findStatNumber(extra, "avgThreePointFieldGoalsMade"),
    threeAttPerGame: findStatNumber(extra, "avgThreePointFieldGoalsAttempted"),
    ftMadePerGame: findStatNumber(extra, "avgFreeThrowsMade"),
    ftAttPerGame: findStatNumber(extra, "avgFreeThrowsAttempted"),
    twoPointPct: findStatNumber(extra, "twoPointFieldGoalPct"),
    twoMadePerGame: findStatNumber(extra, "avgTwoPointFieldGoalsMade"),
    twoAttPerGame: findStatNumber(extra, "avgTwoPointFieldGoalsAttempted"),
    scoringEfficiency: findStatNumber(extra, "scoringEfficiency"),
    shootingEfficiency: findStatNumber(extra, "shootingEfficiency"),
  };
}

function calculateAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function resolveTeam(teams: LiveTeam[], teamParam: string): LiveTeam | undefined {
  return teams.find((t) => String(t.id) === teamParam || t.espnId === teamParam);
}

async function fetchPlayerSeasonStat(player: LivePlayer, seasonYear: number) {
  try {
    const stats = await fetchEspnJson<EspnStatisticsResponse>(
      espnEndpoints.athleteStatistics(String(seasonYear), REGULAR_SEASON_TYPE, player.espnId),
    );
    return mapPlayerSeasonStat(stats, player.id, player.currentTeam.id, 0);
  } catch {
    return null;
  }
}

export async function getTeamProfileLive(teamParam: string) {
  const [teams, players] = await Promise.all([getTeamsLive(), getActivePlayersLive()]);
  const team = resolveTeam(teams, teamParam);
  if (!team) return null;

  const seasonYear = currentSeasonYear();
  const season = { id: 0, year: seasonYear, type: "REGULAR" as const };

  const [standingsData, nbaCupData, scheduleResponse] = await Promise.all([
    getStandingsLive(),
    getNbaCupStandingsLive(),
    fetchEspnJson<EspnScheduleResponse>(espnEndpoints.teamSchedule(team.espnId, String(seasonYear))),
  ]);

  const allStandings = standingsData.conferences.flatMap((c) => c.standings) as Array<
    Record<string, unknown> & { team: LiveTeam }
  >;
  const standing = allStandings.find((s) => s.team.id === team.id) ?? null;
  const divisionStandings = team.division
    ? allStandings
        .filter((s) => s.team.division?.id === team.division!.id)
        .sort((a, b) => ((a.divisionRank as number) ?? 99) - ((b.divisionRank as number) ?? 99))
    : [];

  const nbaCupStanding =
    nbaCupData.groups.flatMap((g) => g.standings).find((s) => s.team.id === team.id) ?? null;

  let teamSeasonStat: Awaited<ReturnType<typeof mapTeamSeasonStat>> | null = null;
  try {
    const stats = await fetchEspnJson<EspnStatisticsResponse>(
      espnEndpoints.teamStatistics(String(seasonYear), REGULAR_SEASON_TYPE, team.espnId),
    );
    const overall = standing
      ? { wins: (standing.wins as number) ?? 0, losses: (standing.losses as number) ?? 0 }
      : { wins: 0, losses: 0 };
    teamSeasonStat = mapTeamSeasonStat(stats, team.id, 0, {
      ...overall,
      avgPointsFor: (standing?.pointsPerGame as number) ?? 0,
      avgPointsAgainst: (standing?.oppPointsPerGame as number) ?? 0,
    });
  } catch {
    teamSeasonStat = null;
  }
  const extendedStats = teamSeasonStat
    ? {
        fieldGoalPct: findStat(teamSeasonStat.extra, "fieldGoalPct"),
        threePointPct: findStat(teamSeasonStat.extra, "threePointPct"),
        freeThrowPct: findStat(teamSeasonStat.extra, "freeThrowPct"),
        reboundsPerGame: findStat(teamSeasonStat.extra, "avgRebounds"),
        assistsPerGame: findStat(teamSeasonStat.extra, "avgAssists"),
        turnoversPerGame: findStat(teamSeasonStat.extra, "avgTurnovers"),
        stealsPerGame: findStat(teamSeasonStat.extra, "avgSteals"),
        blocksPerGame: findStat(teamSeasonStat.extra, "avgBlocks"),
      }
    : null;

  const teamRoster = players.filter((p) => p.currentTeam.id === team.id);
  const rosterSeasonStats = await Promise.all(teamRoster.map((p) => fetchPlayerSeasonStat(p, seasonYear)));
  const roster = teamRoster.map((p, i) => {
    const seasonStat = rosterSeasonStats[i];
    return {
      id: p.id,
      displayName: p.displayName,
      jersey: p.jersey,
      headshotUrl: p.headshotUrl,
      position: p.position,
      age: calculateAge(p.birthDate),
      heightIn: p.heightIn,
      weightLb: p.weightLb,
      college: p.college,
      seasonStat,
      fullStat: seasonStat ? { ...seasonStat, ...buildFullStat(seasonStat.extra) } : null,
    };
  });

  const scheduleEvents = scheduleResponse.events ?? [];
  const schedule = scheduleEvents.map((event) => {
    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    const completed = competition.status.type.completed;
    return {
      id: -Number(event.id),
      espnId: event.id,
      date: event.date,
      status: completed ? "FINAL" : isUnderway(competition.status.type.name) ? "LIVE" : "SCHEDULED",
      broadcast: null,
      leaders: null,
      odds: null,
      homeScore: home?.score ? Number(home.score) : null,
      awayScore: away?.score ? Number(away.score) : null,
      homeTeamId: home ? Number(home.team.id) : null,
      awayTeamId: away ? Number(away.team.id) : null,
      homeTeam: home
        ? { id: Number(home.team.id), abbreviation: home.team.abbreviation, displayName: home.team.displayName, logoUrl: home.team.logos?.[0]?.href ?? null }
        : null,
      awayTeam: away
        ? { id: Number(away.team.id), abbreviation: away.team.abbreviation, displayName: away.team.displayName, logoUrl: away.team.logos?.[0]?.href ?? null }
        : null,
    };
  });

  let coach: Awaited<ReturnType<typeof getTeamCoach>> = null;
  try {
    coach = await getTeamCoach(team.espnId);
  } catch {
    coach = null;
  }

  const playerByEspnId = new Map(players.map((p) => [p.espnId, p]));

  let teamLeadersRaw: Awaited<ReturnType<typeof getTeamLeaders>> = new Map();
  try {
    teamLeadersRaw = await getTeamLeaders(team.espnId, seasonYear);
  } catch {
    teamLeadersRaw = new Map();
  }
  const teamLeaders = LEADER_CATEGORY_DEFS.map(({ group, key }) => {
    const entry = teamLeadersRaw.get(key);
    const player = entry ? playerByEspnId.get(entry.athleteEspnId) ?? null : null;
    return {
      group,
      key,
      statName: entry?.categoryDisplayName ?? key,
      player: player
        ? { id: player.id, displayName: player.displayName, headshotUrl: player.headshotUrl, jersey: player.jersey, position: player.position }
        : null,
      displayValue: entry?.displayValue ?? null,
      secondary: [] as { label: string; value: string | null }[],
    };
  });

  let depthChartRaw: Awaited<ReturnType<typeof getTeamDepthChart>> = [];
  try {
    depthChartRaw = await getTeamDepthChart(team.espnId, seasonYear);
  } catch {
    depthChartRaw = [];
  }
  const depthChart = depthChartRaw.map((pos) => ({
    abbreviation: pos.abbreviation,
    players: pos.athleteEspnIdsByRank.map((espnId) => {
      const player = playerByEspnId.get(espnId);
      return player ? { id: player.id, displayName: player.displayName, jersey: player.jersey } : null;
    }),
  }));

  let injuriesRaw: Awaited<ReturnType<typeof getTeamInjuries>> = [];
  try {
    injuriesRaw = await getTeamInjuries(team.espnId);
  } catch {
    injuriesRaw = [];
  }
  const injuries = injuriesRaw.map((injury) => {
    const player = playerByEspnId.get(injury.athleteEspnId) ?? null;
    return {
      playerId: player?.id ?? null,
      displayName: player?.displayName ?? "Unknown",
      headshotUrl: player?.headshotUrl ?? null,
      jersey: player?.jersey ?? null,
      position: player?.position?.abbreviation ?? null,
      status: injury.status,
      date: injury.date,
      returnDate: injury.returnDate,
      injuryType: injury.injuryType,
      comment: injury.comment,
    };
  });

  return {
    team,
    season,
    availableSeasons: [season],
    standing,
    teamSeasonStat,
    extendedStats,
    nbaCupStanding,
    roster,
    coach,
    schedule,
    divisionStandings,
    news: [],
    teamLeaders,
    depthChart,
    injuries,
    // Stat splits need per-game box scores, which espn-only mode has no
    // way to compute live — the route ignores the `split` query param
    // entirely, so the frontend must not let the user pick one.
    splitsSupported: false,
  };
}

export function getTeamProfileLiveCached(teamParam: string) {
  return cachedEspn(`team-profile-live-${teamParam}`, 5 * 60 * 1000, () => getTeamProfileLive(teamParam));
}
