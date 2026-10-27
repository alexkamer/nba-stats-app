/**
 * Live proxy for ESPN's athlete overview endpoint, awards section only —
 * nothing here is persisted, same non-DB-writing convention as
 * espn-team-injuries.ts. Career highlights have no equivalent in our own
 * DB, so this is the only source for the player Bio tab.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";

interface EspnAthleteOverviewResponse {
  awards?: PlayerAward[];
}

export interface PlayerAward {
  id: string;
  league: string;
  name: string;
  displayCount: string;
  seasons: string[];
}

export async function getPlayerAwards(athleteEspnId: string): Promise<PlayerAward[]> {
  const overview = await fetchEspnJson<EspnAthleteOverviewResponse>(espnEndpoints.athleteOverview(athleteEspnId));
  return overview.awards ?? [];
}
