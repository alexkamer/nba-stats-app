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
// now.core's NBA-scoped feed (unlike `${SITE}/news`, which is a generic
// cross-sport feed that happens to return NBA content) is what actually
// backs espn.com's NBA headlines module — confirmed during the home page
// "Top Headlines" work: `${SITE}/news` surfaced only ~5 HeadlineNews-typed
// articles out of its last 50, this feed surfaced ~9 including stories
// `${SITE}/news` didn't have at all (e.g. the Lakers ownership saga).
const NOW_CORE_NBA_NEWS = "https://now.core.api.espn.com/v1/sports/basketball/nba/news";

export const espnEndpoints = {
  scoreboard: (dates: string) => `${SITE}/scoreboard?dates=${dates}`,
  summary: (eventId: string) => `${SITE}/summary?event=${eventId}`,
  teams: () => `${SITE}/teams`,
  team: (teamId: string) => `${SITE}/teams/${teamId}`,
  teamRoster: (teamId: string) => `${SITE}/teams/${teamId}/roster`,
  teamSchedule: (teamId: string, season: string) =>
    `${SITE}/teams/${teamId}/schedule?season=${season}`,
  news: (limit = 50) => `${NOW_CORE_NBA_NEWS}?limit=${limit}`,
  teamTransactions: (teamId: string, season: string, page = 1) =>
    `${SITE}/transactions?team=${teamId}&season=${season}&page=${page}`,

  athleteOverview: (athleteId: string) => `${SITE_WEB}/athletes/${athleteId}/overview`,
  athleteGamelog: (athleteId: string, params?: { season?: string }) => {
    const query = new URLSearchParams();
    if (params?.season) query.set("season", params.season);
    const qs = query.toString();
    return `${SITE_WEB}/athletes/${athleteId}/gamelog${qs ? `?${qs}` : ""}`;
  },
  athleteSplits: (athleteId: string, params?: { season?: string; category?: string }) => {
    const query = new URLSearchParams();
    if (params?.season) query.set("season", params.season);
    if (params?.category) query.set("category", params.category);
    const qs = query.toString();
    return `${SITE_WEB}/athletes/${athleteId}/splits${qs ? `?${qs}` : ""}`;
  },

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

  // Betting insights (see openspec/changes/add-betting-insights-page) — core
  // API resources confirmed during exploration to carry open/current line
  // movement and player prop markets for scheduled games, unlike `summary`'s
  // `pickcenter` (current-line-only, used by the existing Odds model).
  // `providerId` is the single sportsbook kept (DraftKings = "100" in
  // current testing, the highest-priority provider ESPN lists).
  gameOdds: (eventId: string, providerId: string) =>
    `${CORE}/events/${eventId}/competitions/${eventId}/odds/${providerId}?lang=en&region=us`,
  gamePropBets: (eventId: string, providerId: string, page = 1) =>
    `${CORE}/events/${eventId}/competitions/${eventId}/odds/${providerId}/propBets?lang=en&region=us&page=${page}`,
};

/** Pulls the trailing numeric id off an ESPN `$ref` URL, e.g.
 * ".../teams/5?lang=en" -> "5". */
export function idFromRef(ref: string): string {
  const withoutQuery = ref.split("?")[0];
  const segments = withoutQuery.split("/");
  return segments[segments.length - 1];
}
