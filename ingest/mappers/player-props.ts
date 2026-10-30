import { idFromRef } from "../../lib/espn/endpoints";
import { toPropStatType, type PropStatType } from "../../lib/espn/prop-types";

/**
 * Shape confirmed against the core API's propBets resource
 * (`.../odds/{providerId}/propBets`). Each entry carries no explicit
 * over/under label — ESPN consistently returns the Over entry immediately
 * followed by the Under entry for the same athlete/stat/line (confirmed by
 * sampling: grouping by athlete+type+current target almost always yields
 * exactly 2 entries). Side is therefore inferred positionally within each
 * group, not read from a field.
 */
export interface EspnPropBetItem {
  athlete?: { $ref: string };
  type: { id: string; name: string };
  odds: {
    american: { value: string; open: string };
  };
  lastUpdated: string;
  current: { target: { value: number } };
  open: { target: { value: number } };
}

export interface PlayerPropOddsUpsertInput {
  gameId: number;
  playerId: number;
  provider: string;
  statType: PropStatType;
  side: "OVER" | "UNDER";
  line: number | null;
  odds: number | null;
  openLine: number | null;
  openOdds: number | null;
  lastUpdated: Date;
}

function parseAmerican(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Maps a game's full set of propBets entries (all pages, already
 * concatenated) to `PlayerPropOdds` upsert inputs — filtered to the stat
 * types this app tracks (see lib/espn/prop-types.ts), and only for athletes
 * already known (unknown athletes are skipped, not fabricated). */
export function mapPlayerPropBets(
  items: EspnPropBetItem[],
  gameId: number,
  playerIdByEspnId: Map<string, number>,
  provider: string,
): PlayerPropOddsUpsertInput[] {
  const groups = new Map<string, EspnPropBetItem[]>();

  for (const item of items) {
    if (!item.athlete) continue;
    const statType = toPropStatType(item.type.name);
    if (!statType) continue;
    const playerId = playerIdByEspnId.get(idFromRef(item.athlete.$ref));
    if (!playerId) continue;

    const key = `${playerId}|${statType}|${item.current?.target?.value}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const results: PlayerPropOddsUpsertInput[] = [];
  for (const group of groups.values()) {
    const sides: Array<"OVER" | "UNDER"> = ["OVER", "UNDER"];
    group.slice(0, 2).forEach((item, index) => {
      const playerId = playerIdByEspnId.get(idFromRef(item.athlete!.$ref))!;
      const statType = toPropStatType(item.type.name)!;
      results.push({
        gameId,
        playerId,
        provider,
        statType,
        side: sides[index],
        line: item.current?.target?.value ?? null,
        odds: parseAmerican(item.odds.american.value),
        openLine: item.open?.target?.value ?? null,
        openOdds: parseAmerican(item.odds.american.open),
        lastUpdated: new Date(item.lastUpdated),
      });
    });
  }
  return results;
}
