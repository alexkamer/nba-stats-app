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

  athleteOverview: (athleteId: string) => `${SITE_WEB}/athletes/${athleteId}/overview`,
  athleteGamelog: (athleteId: string) => `${SITE_WEB}/athletes/${athleteId}/gamelog`,

  athletesList: (limit = 1000) => `${CORE}/athletes?limit=${limit}&active=true`,
  teamStatistics: (year: string, seasonType: string, teamId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/teams/${teamId}/statistics`,
  standings: (year: string, seasonType: string, groupId: string) =>
    `${CORE}/seasons/${year}/types/${seasonType}/groups/${groupId}/standings`,
};
