import { prisma } from "@/lib/db";
import { parseDateKey } from "@/lib/briefing/date";

/**
 * Final games for a single local calendar date — shared by the
 * yesterday's-scores section (the date before the viewed one) and the
 * past-date slate-recap section (the viewed date itself), per
 * daily-briefing-page. Only `FINAL` games are returned: a scheduled or
 * in-progress game on the same calendar date isn't a "result" yet.
 */
export interface FinalGameRow {
  id: number;
  espnId: string;
  date: Date;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: number; abbreviation: string; name: string; logoUrl: string | null };
  awayTeam: { id: number; abbreviation: string; name: string; logoUrl: string | null };
}

const TEAM_SELECT = {
  select: { id: true, abbreviation: true, name: true, logoUrl: true },
} as const;

/** `null` for a malformed date key — callers turn that into a 400, same as
 * every other date-keyed briefing query. */
export async function getFinalGamesForDate(dateKey: string): Promise<FinalGameRow[] | null> {
  const startOfDay = parseDateKey(dateKey);
  if (!startOfDay) return null;
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return prisma.game.findMany({
    where: { status: "FINAL", date: { gte: startOfDay, lt: endOfDay } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      espnId: true,
      date: true,
      homeScore: true,
      awayScore: true,
      homeTeam: TEAM_SELECT,
      awayTeam: TEAM_SELECT,
    },
  });
}
