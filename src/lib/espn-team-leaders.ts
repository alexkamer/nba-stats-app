/**
 * Live proxy for ESPN's own "team leaders" endpoint — the authoritative
 * per-team per-season leaderboard ESPN computes itself (confirmed against
 * https://sports.core.api.espn.com/.../teams/{id}/leaders), rather than
 * something we re-derive from our own roster + season-stat join (which,
 * unlike ESPN's, has no games/attempts qualifying threshold and can be
 * skewed by a single-game small sample, e.g. a bench player who went 1/1
 * from the field reading as the "FG% leader"). Nothing here is persisted —
 * same non-DB-writing convention as espn-live.ts.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints, idFromRef } from "../../lib/espn/endpoints";

interface EspnLeaderEntry {
  displayValue: string;
  value: number;
  athlete: { $ref: string };
}

interface EspnLeaderCategory {
  name: string;
  displayName: string;
  leaders?: EspnLeaderEntry[];
}

interface EspnTeamLeadersResponse {
  categories?: EspnLeaderCategory[];
}

export interface TeamLeader {
  athleteEspnId: string;
  value: number;
  displayValue: string;
  categoryDisplayName: string;
}

/** Category names as ESPN names them; the top (rank 0) leader per category
 * is already how ESPN itself decides who to show as the team's leader. */
export async function getTeamLeaders(
  teamEspnId: string,
  seasonYear: number,
  seasonType: "2" | "3" = "2",
): Promise<Map<string, TeamLeader>> {
  const data = await fetchEspnJson<EspnTeamLeadersResponse>(
    espnEndpoints.teamLeaders(String(seasonYear), seasonType, teamEspnId),
  );
  const result = new Map<string, TeamLeader>();
  for (const category of data.categories ?? []) {
    const top = category.leaders?.[0];
    if (!top) continue;
    result.set(category.name, {
      athleteEspnId: idFromRef(top.athlete.$ref),
      value: top.value,
      displayValue: top.displayValue,
      categoryDisplayName: category.displayName,
    });
  }
  return result;
}
