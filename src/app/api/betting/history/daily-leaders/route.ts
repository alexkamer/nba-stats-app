import { prisma } from "@/lib/db";
import { currentSeasonYear } from "@/lib/espn-season";
import { NextResponse } from "next/server";

// Serves the betting-history-page capability's King of the Court calendar:
// the current season's `DailyStatLeader` rows (see daily-stat-leader-
// tracking), each with every tied leader and whether a triple-double
// occurred that day, plus a season-to-date tally of days led per player.
// Scoped to the current season's game date range — `DailyStatLeader` isn't
// itself linked to a season, so season boundaries come from that season's
// games instead.
export async function GET() {
  try {
    const season = await prisma.season.findUnique({
      where: { year_type: { year: currentSeasonYear(), type: "REGULAR" } },
      select: { id: true },
    });

    if (!season) {
      return NextResponse.json({ days: [], crownTally: [] });
    }

    const bounds = await prisma.game.aggregate({
      where: { seasonId: season.id },
      _min: { date: true },
      _max: { date: true },
    });

    if (!bounds._min.date || !bounds._max.date) {
      return NextResponse.json({ days: [], crownTally: [] });
    }

    const dateFilter = { gte: bounds._min.date, lte: bounds._max.date };

    const days = await prisma.dailyStatLeader.findMany({
      where: { date: dateFilter },
      orderBy: { date: "asc" },
      include: {
        entries: {
          include: {
            player: {
              select: {
                id: true,
                espnId: true,
                displayName: true,
                headshotUrl: true,
                // Decorative team-color accent for the calendar cell — the
                // player's current team, not necessarily the team they
                // suited up for on that historical date, which is an
                // acceptable simplification for a purely visual touch.
                currentTeam: { select: { abbreviation: true, color: true, logoUrl: true } },
              },
            },
          },
        },
      },
    });

    const crownCounts = await prisma.dailyStatLeaderEntry.groupBy({
      by: ["playerId"],
      where: { dailyStatLeader: { date: dateFilter } },
      _count: { _all: true },
    });
    const players = await prisma.player.findMany({
      where: { id: { in: crownCounts.map((c) => c.playerId) } },
      select: { id: true, espnId: true, displayName: true, headshotUrl: true },
    });
    const playersById = new Map(players.map((p) => [p.id, p]));
    const crownTally = crownCounts
      .map((c) => ({ player: playersById.get(c.playerId), days: c._count._all }))
      .sort((a, b) => b.days - a.days);

    return NextResponse.json({ days, crownTally });
  } catch (error) {
    console.error("GET /api/betting/history/daily-leaders failed:", error);
    return NextResponse.json({ error: "Failed to load daily leaders" }, { status: 500 });
  }
}
