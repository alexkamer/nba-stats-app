/**
 * Typed builders for every ESPN NBA endpoint path used by this app.
 * No hand-built URL strings anywhere else — see PLAN.md Sec 1/Sec 2.
 *
 * Base pattern confirmed from the NFL-equivalent gist (PLAN.md/SPEC.md
 * provenance): swap sports/football/nfl -> sports/basketball/nba.
 */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const SITE_WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";

export const espnEndpoints = {
  scoreboard: (dates: string) => `${SITE}/scoreboard?dates=${dates}`,
  summary: (eventId: string) => `${SITE}/summary?event=${eventId}`,
  teams: () => `${SITE}/teams`,
  team: (teamId: string) => `${SITE}/teams/${teamId}`,
  teamRoster: (teamId: string) => `${SITE}/teams/${teamId}/roster`,
  teamSchedule: (teamId: string, season: string) =>
    `${SITE}/teams/${teamId}/schedule?season=${season}`,
  news: (limit = 50) => `${SITE}/news?limit=${limit}`,
  teamTransactions: (teamId: string, season: string, page = 1) =>
    `${SITE}/transactions?team=${teamId}&season=${season}&page=${page}`,

  athleteOverview: (athleteId: string) => `${SITE_WEB}/athletes/${athleteId}/overview`,
  athleteGamelog: (athleteId: string) => `${SITE_WEB}/athletes/${athleteId}/gamelog`,

  athletesList: (limit = 1000) => `${CORE}/athletes?limit=${limit}&active=true`,
  seasonTeams: (year: string) => `${CORE}/seasons/${year}/teams?limit=50`,
  seasonTeam: (year: string, teamId: string) => `${CORE}/seasons/${year}/teams/${teamId}`,
  teamStatistics: (year: string, seasonType: string, teamId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/teams/${teamId}/statistics`,
  teamLeaders: (year: string, seasonType: string, teamId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/teams/${teamId}/leaders`,
  teamDepthChart: (year: string, teamId: string) =>
    `${CORE}/seasons/${year}/teams/${teamId}/depthcharts`,
  // No `seasons/{year}` segment — unlike most other team-scoped CORE
  // endpoints, ESPN serves this one directly off `teams/{id}` and always
  // returns the current season's reports.
  teamInjuries: (teamId: string) => `${CORE}/teams/${teamId}/injuries`,
  athleteStatistics: (year: string, seasonType: string, athleteId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/athletes/${athleteId}/statistics`,
  standings: (year: string, seasonType: string, groupId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/groups/${groupId}/standings`,
  standingsView: (year: string, seasonType: string, groupId: string, viewId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/groups/${groupId}/standings/${viewId}`,

  // Conference/division tree (SPEC.md Sec 6: conference/division models) —
  // discovered during M2: top-level groups are the 2 conferences, each
  // conference's `children` are its divisions, each division's `teams`
  // lists its member teams.
  groups: (year: string, seasonType: string) => `${CORE}/seasons/${year}/types/${seasonType}/groups`,
  group: (year: string, seasonType: string, groupId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/groups/${groupId}`,
  groupChildren: (year: string, seasonType: string, groupId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/groups/${groupId}/children`,
  groupTeams: (year: string, seasonType: string, groupId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/groups/${groupId}/teams`,
};

/** Pulls the trailing numeric id off an ESPN `$ref` URL, e.g.
 * ".../teams/5?lang=en" -> "5". */
export function idFromRef(ref: string): string {
  const withoutQuery = ref.split("?")[0];
  const segments = withoutQuery.split("/");
  return segments[segments.length - 1];
}
