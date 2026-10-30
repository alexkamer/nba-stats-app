// Espn-only equivalent of /api/standings and /api/nba-cup-standings — no
// season history (ESPN's live endpoints only serve the current season), so
// availableSeasons is always just [currentSeason].
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints, idFromRef } from "@espn/endpoints";
import {
  conferenceRankOf,
  extractOverallRecord,
  mapDivisionStanding,
  mapExpandedStanding,
  mapNbaCupStanding,
  mapStanding,
  type EspnStandingsResponse,
} from "../../ingest/mappers/standings";
import { mapTeamSeasonStat, type EspnStatisticsResponse } from "../../ingest/mappers/season-stats";
import { cachedEspn } from "./espn-cache";
import { currentSeasonYear, REGULAR_SEASON_TYPE } from "./espn-season";
import { getTeamsLive, type LiveTeam } from "./espn-teams-list";

const NBA_CUP_START_YEAR = 2024;
const NBA_CUP_GROUPS = [
  { espnId: "22", groupName: "East Group A" },
  { espnId: "23", groupName: "East Group B" },
  { espnId: "24", groupName: "East Group C" },
  { espnId: "25", groupName: "West Group A" },
  { espnId: "26", groupName: "West Group B" },
  { espnId: "27", groupName: "West Group C" },
];

function buildDivisionRankMap(
  allRecords: { teamEspnId: string; record: ReturnType<typeof extractOverallRecord> }[],
  teams: LiveTeam[],
): Map<string, number> {
  const divisionIdByTeamEspnId = new Map(teams.map((t) => [t.espnId, t.division?.id ?? null]));
  const byDivision = new Map<string, { teamEspnId: string; record: ReturnType<typeof extractOverallRecord> }[]>();
  for (const entry of allRecords) {
    const divisionId = divisionIdByTeamEspnId.get(entry.teamEspnId);
    if (!divisionId) continue;
    const group = byDivision.get(divisionId) ?? [];
    group.push(entry);
    byDivision.set(divisionId, group);
  }

  const rankByTeamEspnId = new Map<string, number>();
  for (const group of byDivision.values()) {
    const ranked = [...group].sort((a, b) => {
      const winPctA = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
      const winPctB = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
      return winPctB - winPctA || b.record.wins - a.record.wins;
    });
    ranked.forEach(({ teamEspnId }, index) => rankByTeamEspnId.set(teamEspnId, index + 1));
  }
  return rankByTeamEspnId;
}

async function fetchStandingsLive() {
  const seasonYear = currentSeasonYear();
  const teams = await getTeamsLive();
  const conferenceEspnIds = [...new Set(teams.map((t) => t.division?.conference.espnId).filter((id): id is string => !!id))];

  const [conferenceViews, expandedViews, divisionViews] = await Promise.all([
    Promise.all(
      conferenceEspnIds.map((id) =>
        fetchEspnJson<EspnStandingsResponse>(espnEndpoints.standingsView(String(seasonYear), REGULAR_SEASON_TYPE, id, "0")),
      ),
    ),
    Promise.all(
      conferenceEspnIds.map((id) =>
        fetchEspnJson<EspnStandingsResponse>(espnEndpoints.standingsView(String(seasonYear), REGULAR_SEASON_TYPE, id, "1")),
      ),
    ),
    Promise.all(
      conferenceEspnIds.map((id) =>
        fetchEspnJson<EspnStandingsResponse>(espnEndpoints.standingsView(String(seasonYear), REGULAR_SEASON_TYPE, id, "2")),
      ),
    ),
  ]);

  const allEntries = conferenceViews.flatMap((view) => view.standings);
  const expandedByTeamEspnId = new Map(
    expandedViews.flatMap((view) => view.standings).map((entry) => [idFromRef(entry.team.$ref), mapExpandedStanding(entry)]),
  );
  const divisionByTeamEspnId = new Map(
    divisionViews.flatMap((view) => view.standings).map((entry) => [idFromRef(entry.team.$ref), mapDivisionStanding(entry)]),
  );
  const allRecords = allEntries.map((entry) => ({
    teamEspnId: idFromRef(entry.team.$ref),
    record: extractOverallRecord(entry),
  }));
  const divisionRankByTeamEspnId = buildDivisionRankMap(allRecords, teams);
  const teamByEspnId = new Map(teams.map((t) => [t.espnId, t]));

  const results = await Promise.all(
    allEntries.map(async (entry) => {
      const teamEspnId = idFromRef(entry.team.$ref);
      const team = teamByEspnId.get(teamEspnId);
      if (!team) return null;

      const conferenceRank = conferenceRankOf(entry);
      const divisionRank = divisionRankByTeamEspnId.get(teamEspnId) ?? null;
      const standing = {
        ...mapStanding(entry, team.id, 0, conferenceRank, divisionRank),
        ...(expandedByTeamEspnId.get(teamEspnId) ?? {}),
        ...(divisionByTeamEspnId.get(teamEspnId) ?? {}),
      };

      const overall = extractOverallRecord(entry);
      const teamStats = await fetchEspnJson<EspnStatisticsResponse>(
        espnEndpoints.teamStatistics(String(seasonYear), REGULAR_SEASON_TYPE, teamEspnId),
      );
      const teamStatInput = mapTeamSeasonStat(teamStats, team.id, 0, overall);

      return {
        ...standing,
        team,
        conferenceName: team.division?.conference.name ?? "Unknown",
        pointsPerGame: teamStatInput.pointsPerGame,
        oppPointsPerGame: teamStatInput.oppPointsPerGame,
      };
    }),
  );

  const season = { id: 0, year: seasonYear, type: "REGULAR" as const };
  const conferenceMap = new Map<string, { conferenceName: string; standings: unknown[] }>();
  for (const row of results) {
    if (!row) continue;
    const group = conferenceMap.get(row.conferenceName) ?? { conferenceName: row.conferenceName, standings: [] };
    group.standings.push(row);
    conferenceMap.set(row.conferenceName, group);
  }

  return {
    season,
    availableSeasons: [season],
    conferences: Array.from(conferenceMap.values()),
  };
}

export function getStandingsLive() {
  return cachedEspn("standings-live", 5 * 60 * 1000, fetchStandingsLive);
}

async function fetchNbaCupStandingsLive() {
  const seasonYear = currentSeasonYear();
  const season = { id: 0, year: seasonYear, type: "REGULAR" as const };
  if (seasonYear < NBA_CUP_START_YEAR) {
    return { season, availableSeasons: [], groups: [] };
  }

  const teams = await getTeamsLive();
  const teamByEspnId = new Map(teams.map((t) => [t.espnId, t]));
  const groupViews = await Promise.all(
    NBA_CUP_GROUPS.map((group) =>
      fetchEspnJson<EspnStandingsResponse>(
        espnEndpoints.standingsView(String(seasonYear), REGULAR_SEASON_TYPE, group.espnId, "3"),
      ),
    ),
  );

  const groups = groupViews.map((view, i) => ({
    groupName: NBA_CUP_GROUPS[i].groupName,
    standings: view.standings
      .map((entry) => {
        const teamEspnId = idFromRef(entry.team.$ref);
        const team = teamByEspnId.get(teamEspnId);
        if (!team) return null;
        return { ...mapNbaCupStanding(entry), team };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  }));

  return { season, availableSeasons: [season], groups };
}

export function getNbaCupStandingsLive() {
  return cachedEspn("nba-cup-standings-live", 5 * 60 * 1000, fetchNbaCupStandingsLive);
}
