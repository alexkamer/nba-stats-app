/**
 * Live proxy for ESPN's athlete splits endpoint — nothing here is
 * persisted, same non-DB-writing convention as espn-player-awards.ts.
 * Situational splits (home/road, by month, by opponent, etc.) have no
 * equivalent in our own DB.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";

export interface PlayerSplitRow {
  displayName: string;
  abbreviation: string;
  stats: string[];
}

export interface PlayerSplitCategory {
  name: string;
  displayName: string;
  splits: PlayerSplitRow[];
}

export interface PlayerSplitsFilterOption {
  value: string;
  displayValue: string;
}

export interface PlayerSplitsFilter {
  name: string;
  displayName: string;
  value: string;
  options: PlayerSplitsFilterOption[];
}

export interface PlayerSplits {
  displayName: string;
  labels: string[];
  splitCategories: PlayerSplitCategory[];
  filters: PlayerSplitsFilter[];
}

export async function getPlayerSplits(
  athleteEspnId: string,
  options: { season?: string; category?: string } = {},
): Promise<PlayerSplits> {
  const response = await fetchEspnJson<PlayerSplits>(espnEndpoints.athleteSplits(athleteEspnId, options));
  return {
    displayName: response.displayName ?? "",
    labels: response.labels ?? [],
    splitCategories: response.splitCategories ?? [],
    filters: response.filters ?? [],
  };
}
