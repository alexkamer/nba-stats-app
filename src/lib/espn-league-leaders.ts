/**
 * League-wide per-game statistical leaders — ESPN's own computed
 * leaderboard (confirmed against
 * https://sports.core.api.espn.com/.../seasons/{year}/types/{type}/leaders),
 * the league-scoped sibling of espn-team-leaders.ts's per-team leaders.
 * Nothing here is persisted — same non-DB-writing convention as
 * espn-live.ts.
 */
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints, idFromRef } from "@espn/endpoints";
import { cachedEspn } from "./espn-cache";
import { currentSeasonYear, REGULAR_SEASON_TYPE } from "./espn-season";

interface EspnLeaderEntry {
  displayValue: string;
  value: number;
  athlete: { $ref: string };
  team: { $ref: string };
}

interface EspnLeaderCategory {
  name: string;
  displayName: string;
  abbreviation: string;
  leaders?: EspnLeaderEntry[];
}

interface EspnLeaguesLeadersResponse {
  categories?: EspnLeaderCategory[];
}

export interface LeagueLeaderEntry {
  athleteEspnId: string;
  teamEspnId: string;
  value: number;
  displayValue: string;
}

export interface LeagueLeaderCategory {
  key: string;
  label: string;
  abbreviation: string;
  leaders: LeagueLeaderEntry[];
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "pointsPerGame", label: "Points" },
  { key: "reboundsPerGame", label: "Rebounds" },
  { key: "assistsPerGame", label: "Assists" },
  { key: "stealsPerGame", label: "Steals" },
  { key: "blocksPerGame", label: "Blocks" },
];

const PER_CATEGORY_LIMIT = 5;

async function fetchLeagueLeaders(): Promise<LeagueLeaderCategory[]> {
  const data = await fetchEspnJson<EspnLeaguesLeadersResponse>(
    espnEndpoints.leagueLeaders(String(currentSeasonYear()), REGULAR_SEASON_TYPE),
  );
  const categoryByName = new Map((data.categories ?? []).map((c) => [c.name, c]));

  return CATEGORIES.map(({ key, label }) => {
    const category = categoryByName.get(key);
    const leaders = (category?.leaders ?? []).slice(0, PER_CATEGORY_LIMIT).map((entry) => ({
      athleteEspnId: idFromRef(entry.athlete.$ref),
      teamEspnId: idFromRef(entry.team.$ref),
      value: entry.value,
      displayValue: entry.displayValue,
    }));
    return { key, label, abbreviation: category?.abbreviation ?? "", leaders };
  });
}

/** 15-minute cache — per-game averages move slowly enough within a day
 * that a tighter TTL would just re-pay the same ESPN call for no benefit. */
export function getLeagueLeaders(): Promise<LeagueLeaderCategory[]> {
  return cachedEspn("league-leaders", 15 * 60 * 1000, fetchLeagueLeaders);
}
