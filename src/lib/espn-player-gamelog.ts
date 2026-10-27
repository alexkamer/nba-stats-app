/**
 * Live proxy for ESPN's athlete gamelog endpoint — nothing here is
 * persisted, same non-DB-writing convention as espn-player-splits.ts.
 * Flattens ESPN's events-dict + seasonTypes/categories shape into
 * per-game rows the client can render directly.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";

export interface GameLogGame {
  eventId: string;
  date: string;
  atVs: string;
  opponentAbbreviation: string;
  opponentLogo: string | null;
  opponentId: string;
  result: "W" | "L" | null;
  teamScore: string | null;
  opponentScore: string | null;
  stats: string[];
}

export interface GameLogCategory {
  displayName: string;
  games: GameLogGame[];
  totals: string[] | null;
}

export interface GameLogSummaryRow {
  displayName: string;
  stats: string[];
}

export interface GameLogSeasonType {
  displayName: string;
  displayTeam: string | null;
  categories: GameLogCategory[];
  summary: GameLogSummaryRow[];
}

export interface PlayerGamelogFilterOption {
  value: string;
  displayValue: string;
}

export interface PlayerGamelogFilter {
  name: string;
  displayName: string;
  value: string;
  options: PlayerGamelogFilterOption[];
}

export interface PlayerGamelog {
  labels: string[];
  seasonTypes: GameLogSeasonType[];
  filters: PlayerGamelogFilter[];
}

interface RawEvent {
  atVs: string;
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamScore: string;
  awayTeamScore: string;
  gameResult: string;
  opponent: { id: string; abbreviation: string; logo: string | null };
  team: { id: string };
}

interface RawCategory {
  displayName: string;
  events: { eventId: string; stats: string[] }[];
  totals?: string[];
}

interface RawSeasonType {
  displayName: string;
  displayTeam?: string;
  categories: RawCategory[];
  summary?: { stats?: { displayName: string; stats: string[] }[] };
}

interface RawGamelogResponse {
  labels?: string[];
  filters?: PlayerGamelogFilter[];
  events?: Record<string, RawEvent>;
  seasonTypes?: RawSeasonType[];
}

export async function getPlayerGamelog(
  athleteEspnId: string,
  options: { season?: string } = {},
): Promise<PlayerGamelog> {
  const response = await fetchEspnJson<RawGamelogResponse>(espnEndpoints.athleteGamelog(athleteEspnId, options));
  const events = response.events ?? {};

  const seasonTypes: GameLogSeasonType[] = (response.seasonTypes ?? []).map((seasonType) => ({
    displayName: seasonType.displayName ?? "",
    displayTeam: seasonType.displayTeam ?? null,
    categories: (seasonType.categories ?? []).map((category) => ({
      displayName: category.displayName ?? "",
      totals: category.totals ?? null,
      games: (category.events ?? [])
        .map((entry): GameLogGame | null => {
          const event = events[entry.eventId];
          if (!event) return null;
          const isHome = event.team?.id === event.homeTeamId;
          return {
            eventId: entry.eventId,
            date: event.gameDate,
            atVs: event.atVs,
            opponentAbbreviation: event.opponent?.abbreviation ?? "",
            opponentLogo: event.opponent?.logo ?? null,
            opponentId: event.opponent?.id ?? "",
            result: event.gameResult === "W" || event.gameResult === "L" ? event.gameResult : null,
            teamScore: isHome ? event.homeTeamScore : event.awayTeamScore,
            opponentScore: isHome ? event.awayTeamScore : event.homeTeamScore,
            stats: entry.stats ?? [],
          };
        })
        .filter((game): game is GameLogGame => game !== null),
    })),
    summary: seasonType.summary?.stats ?? [],
  }));

  return {
    labels: response.labels ?? [],
    seasonTypes,
    filters: response.filters ?? [],
  };
}
