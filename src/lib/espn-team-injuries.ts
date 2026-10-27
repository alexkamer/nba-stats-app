/**
 * Live proxy for ESPN's team injuries endpoint — nothing here is persisted,
 * same non-DB-writing convention as espn-team-depth-chart.ts. The team
 * injuries list only carries `$ref`s to individual injury records, so each
 * one is fetched in turn (small list, a handful of entries per team).
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints, idFromRef } from "../../lib/espn/endpoints";

interface EspnInjuryListResponse {
  items?: { $ref: string }[];
}

interface EspnInjuryDetail {
  status: string;
  date: string;
  shortComment?: string;
  longComment?: string;
  athlete: { $ref: string };
  type?: { name: string; description?: string; abbreviation?: string };
  details?: {
    type?: string;
    location?: string;
    side?: string;
    returnDate?: string;
    fantasyStatus?: { description?: string; abbreviation?: string };
  };
}

export interface TeamInjury {
  athleteEspnId: string;
  status: string;
  date: string;
  comment: string | null;
  injuryType: string | null;
  returnDate: string | null;
}

export async function getTeamInjuries(teamEspnId: string): Promise<TeamInjury[]> {
  const list = await fetchEspnJson<EspnInjuryListResponse>(espnEndpoints.teamInjuries(teamEspnId));
  const refs = list.items ?? [];
  const details = await Promise.all(refs.map((ref) => fetchEspnJson<EspnInjuryDetail>(ref.$ref)));
  return details.map((injury) => ({
    athleteEspnId: idFromRef(injury.athlete.$ref),
    status: injury.status,
    date: injury.date,
    comment: injury.shortComment ?? injury.longComment ?? null,
    injuryType: injury.details?.type ?? null,
    returnDate: injury.details?.returnDate ?? null,
  }));
}
