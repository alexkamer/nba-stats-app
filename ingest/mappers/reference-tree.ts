import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints, idFromRef } from "../../lib/espn/endpoints";

export interface DivisionNode {
  espnId: string;
  name: string;
  teamEspnIds: string[];
}

export interface ConferenceNode {
  espnId: string;
  name: string;
  divisions: DivisionNode[];
}

/**
 * Walks ESPN's conference -> division -> teams group hierarchy (discovered
 * during M2; see PLAN.md Sec 3/M2). No conference/division IDs are
 * hardcoded — they're whatever the top-level `/groups` call returns this
 * season, so a restructure wouldn't silently break ingestion.
 */
export async function fetchLeagueTree(
  year: string,
  seasonType: string,
): Promise<ConferenceNode[]> {
  const top = await fetchEspnJson<{ items: { $ref: string }[] }>(
    espnEndpoints.groups(year, seasonType),
  );
  const conferenceIds = top.items.map((i) => idFromRef(i.$ref));

  return Promise.all(
    conferenceIds.map(async (confId): Promise<ConferenceNode> => {
      const [conf, children] = await Promise.all([
        fetchEspnJson<{ name: string }>(espnEndpoints.group(year, seasonType, confId)),
        fetchEspnJson<{ items: { $ref: string }[] }>(
          espnEndpoints.groupChildren(year, seasonType, confId),
        ),
      ]);
      const divisionIds = children.items.map((i) => idFromRef(i.$ref));

      const divisions = await Promise.all(
        divisionIds.map(async (divId): Promise<DivisionNode> => {
          const [div, teams] = await Promise.all([
            fetchEspnJson<{ name: string }>(espnEndpoints.group(year, seasonType, divId)),
            fetchEspnJson<{ items: { $ref: string }[] }>(
              espnEndpoints.groupTeams(year, seasonType, divId),
            ),
          ]);
          return {
            espnId: divId,
            name: div.name,
            teamEspnIds: teams.items.map((i) => idFromRef(i.$ref)),
          };
        }),
      );

      return { espnId: confId, name: conf.name, divisions };
    }),
  );
}
