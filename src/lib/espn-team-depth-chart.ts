/**
 * Live proxy for ESPN's team depth chart endpoint — nothing here is
 * persisted, same non-DB-writing convention as espn-live.ts. Returned ranks
 * only carry an athlete `$ref`; callers resolve those espnIds against our
 * own Player table rather than fetching each athlete from ESPN.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints, idFromRef } from "../../lib/espn/endpoints";

interface EspnDepthChartAthlete {
  athlete: { $ref: string };
  rank: number;
}

interface EspnDepthChartPosition {
  position: { abbreviation: string };
  athletes: EspnDepthChartAthlete[];
}

interface EspnDepthChartItem {
  positions: Record<string, EspnDepthChartPosition>;
}

interface EspnDepthChartResponse {
  items?: EspnDepthChartItem[];
}

export interface DepthChartPosition {
  abbreviation: string;
  athleteEspnIdsByRank: string[];
}

// ESPN's own display order — pg/sg/sf/pf/c keys, Point Guard through Center.
const POSITION_ORDER = ["pg", "sg", "sf", "pf", "c"];

export async function getTeamDepthChart(teamEspnId: string, seasonYear: number): Promise<DepthChartPosition[]> {
  const data = await fetchEspnJson<EspnDepthChartResponse>(
    espnEndpoints.teamDepthChart(String(seasonYear), teamEspnId),
  );
  const positions = data.items?.[0]?.positions ?? {};
  return POSITION_ORDER.filter((key) => positions[key]).map((key) => {
    const position = positions[key];
    const athleteEspnIdsByRank = [...position.athletes]
      .sort((a, b) => a.rank - b.rank)
      .map((a) => idFromRef(a.athlete.$ref));
    return { abbreviation: position.position.abbreviation, athleteEspnIdsByRank };
  });
}
