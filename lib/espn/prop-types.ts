/**
 * Maps ESPN's `propBets[].type.name` strings to the subset of prop markets
 * the betting-insights page surfaces (see design.md "Prop odds volume" risk
 * — quarter/half markets and milestone props are deliberately not ingested).
 */
export type PropStatType =
  | "POINTS"
  | "REBOUNDS"
  | "ASSISTS"
  | "THREE_POINTERS_MADE"
  | "STEALS"
  | "BLOCKS"
  | "POINTS_ASSISTS"
  | "POINTS_REBOUNDS"
  | "REBOUNDS_ASSISTS"
  | "POINTS_REBOUNDS_ASSISTS"
  | "DOUBLE_DOUBLE"
  | "TRIPLE_DOUBLE";

const ESPN_PROP_TYPE_NAME_TO_STAT_TYPE: Record<string, PropStatType> = {
  "Total Points": "POINTS",
  "Total Rebounds": "REBOUNDS",
  "Total Assists": "ASSISTS",
  "Total 3-Point Field Goals": "THREE_POINTERS_MADE",
  "Total Steals": "STEALS",
  "Total Blocks": "BLOCKS",
  "Total Points and Assists": "POINTS_ASSISTS",
  "Total Points and Rebounds": "POINTS_REBOUNDS",
  "Total Assists and Rebounds": "REBOUNDS_ASSISTS",
  "Total Points, Rebounds, and Assists": "POINTS_REBOUNDS_ASSISTS",
  "To Record a Double Double": "DOUBLE_DOUBLE",
  "To Record a Triple Double": "TRIPLE_DOUBLE",
};

/** Returns `null` for any ESPN prop market this app doesn't track. */
export function toPropStatType(espnTypeName: string): PropStatType | null {
  return ESPN_PROP_TYPE_NAME_TO_STAT_TYPE[espnTypeName] ?? null;
}
