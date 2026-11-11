import { prisma } from "@/lib/db";
import { parseDateKey } from "@/lib/briefing/date";

/**
 * Today's schedule (system pick vs. market line) and injury report for
 * daily-briefing-page — both scoped to games on the viewed date, reusing
 * the same `GameProjection`/`Odds`/`PlayerAvailability` relations the
 * betting-insights-page capability already reads (see
 * src/app/api/betting/upcoming/route.ts), trimmed to what the briefing
 * needs to display.
 */

const TEAM_SELECT = {
  select: { id: true, abbreviation: true, name: true, logoUrl: true },
} as const;

export interface ScheduleGameRow {
  id: number;
  espnId: string;
  date: Date;
  status: string;
  homeTeam: { id: number; abbreviation: string; name: string; logoUrl: string | null };
  awayTeam: { id: number; abbreviation: string; name: string; logoUrl: string | null };
  pick: { projectedHomeScore: number; projectedAwayScore: number; projectedMargin: number } | null;
  market: { spread: number | null; overUnder: number | null } | null;
}

/** `null` for a malformed date key. */
export async function getScheduleForDate(dateKey: string): Promise<ScheduleGameRow[] | null> {
  const startOfDay = parseDateKey(dateKey);
  if (!startOfDay) return null;
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const games = await prisma.game.findMany({
    where: { date: { gte: startOfDay, lt: endOfDay } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      espnId: true,
      date: true,
      status: true,
      homeTeam: TEAM_SELECT,
      awayTeam: TEAM_SELECT,
      gameProjection: {
        select: { projectedHomeScore: true, projectedAwayScore: true, projectedMargin: true },
      },
      odds: { select: { spread: true, overUnder: true } },
    },
  });

  return games.map((g) => ({
    id: g.id,
    espnId: g.espnId,
    date: g.date,
    status: g.status,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    pick: g.gameProjection,
    market: g.odds,
  }));
}

export interface InjuryReportRow {
  playerId: number;
  status: string;
  player: { id: number; displayName: string };
  team: { id: number; abbreviation: string } | null;
}

/** OUT/DOUBTFUL/QUESTIONABLE availability snapshots for players on teams
 * with a game on the viewed date — excludes AVAILABLE/PROBABLE, which
 * aren't worth surfacing in a short injury report. `null` for a malformed
 * date key. */
export async function getInjuryReportForDate(dateKey: string): Promise<InjuryReportRow[] | null> {
  const startOfDay = parseDateKey(dateKey);
  if (!startOfDay) return null;
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const rows = await prisma.playerAvailability.findMany({
    where: {
      status: { in: ["OUT", "DOUBTFUL", "QUESTIONABLE"] },
      game: { date: { gte: startOfDay, lt: endOfDay } },
    },
    select: {
      playerId: true,
      status: true,
      player: {
        select: { id: true, displayName: true, currentTeam: { select: { id: true, abbreviation: true } } },
      },
    },
  });

  return rows.map((r) => ({
    playerId: r.playerId,
    status: r.status,
    player: { id: r.player.id, displayName: r.player.displayName },
    team: r.player.currentTeam,
  }));
}
