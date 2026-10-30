// Espn-only equivalent of `prisma.team.findMany` — no DB, so "id" is the
// ESPN team id (as a number) rather than an internal autoincrement id.
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints } from "@espn/endpoints";
import { fetchLeagueTree } from "../../ingest/mappers/reference-tree";
import { mapTeam, type EspnSiteTeamListItem } from "../../ingest/mappers/team";
import { cachedEspn } from "./espn-cache";
import { currentSeasonYear, REGULAR_SEASON_TYPE } from "./espn-season";

interface EspnTeamsListResponse {
  sports: { leagues: { teams: { team: EspnSiteTeamListItem }[] }[] }[];
}

export interface LiveConference {
  id: string;
  espnId: string;
  name: string;
}

export interface LiveDivision {
  id: string;
  espnId: string;
  name: string;
  conference: LiveConference;
}

export interface LiveTeam {
  id: number;
  espnId: string;
  name: string;
  location: string;
  displayName: string;
  abbreviation: string;
  color: string | null;
  alternateColor: string | null;
  logoUrl: string | null;
  division: LiveDivision | null;
}

async function fetchTeamsLive(): Promise<LiveTeam[]> {
  const [teamsList, tree] = await Promise.all([
    fetchEspnJson<EspnTeamsListResponse>(espnEndpoints.teams()),
    fetchLeagueTree(String(currentSeasonYear()), REGULAR_SEASON_TYPE),
  ]);
  const siteTeams = teamsList.sports[0].leagues[0].teams.map((t) => t.team);

  const divisionByTeamEspnId = new Map<string, LiveDivision>();
  for (const conf of tree) {
    const conference: LiveConference = { id: conf.espnId, espnId: conf.espnId, name: conf.name };
    for (const div of conf.divisions) {
      const division: LiveDivision = { id: div.espnId, espnId: div.espnId, name: div.name, conference };
      for (const teamEspnId of div.teamEspnIds) {
        divisionByTeamEspnId.set(teamEspnId, division);
      }
    }
  }

  return siteTeams
    .map((siteTeam) => {
      const mapped = mapTeam(siteTeam, null, null);
      return {
        id: Number(mapped.espnId),
        espnId: mapped.espnId,
        name: mapped.name,
        location: mapped.location,
        displayName: mapped.displayName,
        abbreviation: mapped.abbreviation,
        color: mapped.color,
        alternateColor: mapped.alternateColor,
        logoUrl: mapped.logoUrl,
        division: divisionByTeamEspnId.get(mapped.espnId) ?? null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** 5-minute cache — this fans out to ~1 + (2 + 6*2) ESPN calls (team list +
 * conference/division tree) on a cold hit. */
export function getTeamsLive(): Promise<LiveTeam[]> {
  return cachedEspn("teams-live", 5 * 60 * 1000, fetchTeamsLive);
}
