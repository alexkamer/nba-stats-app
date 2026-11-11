import { prisma } from "@/lib/db";
import { parseDateKey } from "@/lib/briefing/date";

/**
 * Plain top-5-by-points-for-a-date list (see daily-briefing-page's Top
 * Performers section) — distinct from DailyStatLeader, which only tracks
 * the single combined points+rebounds+assists leader. Pure ranking lives
 * in `rankTopScorers` so it's testable without a database.
 */
export interface ScorerRow {
  playerId: number;
  points: number;
}

/** Ranks by points descending, ties broken by ascending playerId so the
 * result is deterministic regardless of input or database row order. */
export function rankTopScorers<T extends ScorerRow>(rows: T[], limit = 5): T[] {
  return [...rows]
    .sort((a, b) => b.points - a.points || a.playerId - b.playerId)
    .slice(0, limit);
}

export interface TopScorerRow {
  playerId: number;
  points: number;
  player: { id: number; displayName: string; headshotUrl: string | null };
  team: { id: number; abbreviation: string } | null;
}

/** `null` for a malformed date key, same convention as `getFinalGamesForDate`. */
export async function getTopScorersForDate(dateKey: string, limit = 5): Promise<TopScorerRow[] | null> {
  const startOfDay = parseDateKey(dateKey);
  if (!startOfDay) return null;
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const rows = await prisma.playerGameStat.findMany({
    where: { points: { not: null }, game: { status: "FINAL", date: { gte: startOfDay, lt: endOfDay } } },
    select: {
      playerId: true,
      points: true,
      player: { select: { id: true, displayName: true, headshotUrl: true } },
      team: { select: { id: true, abbreviation: true } },
    },
  });

  return rankTopScorers(rows.map((r) => ({ ...r, points: r.points! })), limit);
}
