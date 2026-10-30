import type { PropStatType } from "../espn/prop-types";

export interface RawPlayerGameRow {
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  threeMade: number | null;
  steals: number | null;
  blocks: number | null;
  minutes: number | null;
}

/** Extracts the raw per-game value for a tracked prop stat from a
 * `PlayerGameStat` row — shared by projection generation and grading so
 * both agree on exactly what each `PropStatType` means. */
export function extractStatValue(statType: PropStatType, row: RawPlayerGameRow): number {
  const points = row.points ?? 0;
  const rebounds = row.rebounds ?? 0;
  const assists = row.assists ?? 0;
  switch (statType) {
    case "POINTS":
      return points;
    case "REBOUNDS":
      return rebounds;
    case "ASSISTS":
      return assists;
    case "THREE_POINTERS_MADE":
      return row.threeMade ?? 0;
    case "STEALS":
      return row.steals ?? 0;
    case "BLOCKS":
      return row.blocks ?? 0;
    case "POINTS_ASSISTS":
      return points + assists;
    case "POINTS_REBOUNDS":
      return points + rebounds;
    case "REBOUNDS_ASSISTS":
      return rebounds + assists;
    case "POINTS_REBOUNDS_ASSISTS":
      return points + rebounds + assists;
    case "DOUBLE_DOUBLE":
    case "TRIPLE_DOUBLE": {
      const categoriesAtTen = [points, rebounds, assists, row.steals ?? 0, row.blocks ?? 0].filter(
        (v) => v >= 10,
      ).length;
      return categoriesAtTen >= (statType === "DOUBLE_DOUBLE" ? 2 : 3) ? 1 : 0;
    }
  }
}
