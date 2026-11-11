import { prisma } from "@/lib/db";
import { parseDateKey } from "@/lib/briefing/date";

/**
 * Reads back the daily points+rebounds+assists leader(s) for a local
 * calendar date (see daily-stat-leader-tracking) for the Top Performers
 * section of daily-briefing-page. `DailyStatLeader.date` is stored as the
 * same local-midnight `Date` `parseDateKey` produces (see
 * ingest/compute-daily-stat-leaders.ts's own `parseDayKey`), so a direct
 * `findUnique` by that value is exact — no range query needed.
 */
export interface DailyLeaderEntryRow {
  playerId: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
  player: { id: number; displayName: string; headshotUrl: string | null };
}

/** `null` for a malformed date key; `undefined` when no leader has been
 * recorded for that date yet (e.g. the date's games aren't all final). */
export async function getDailyLeaderForDate(
  dateKey: string,
): Promise<DailyLeaderEntryRow[] | null | undefined> {
  const date = parseDateKey(dateKey);
  if (!date) return null;

  const leader = await prisma.dailyStatLeader.findUnique({
    where: { date },
    include: {
      entries: {
        select: {
          playerId: true,
          pointsReboundsAssists: true,
          hadTripleDouble: true,
          player: { select: { id: true, displayName: true, headshotUrl: true } },
        },
      },
    },
  });

  return leader?.entries;
}
