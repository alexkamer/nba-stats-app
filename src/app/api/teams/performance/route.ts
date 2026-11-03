import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { currentSeasonYear } from "@/lib/espn-season";
import { averageLabel } from "@lib/accuracy/grade-performance";
import { NextResponse } from "next/server";

// Serves the team-performance-views capability's league leaderboard: every
// team with at least one graded game this regular season, ranked by average
// cover margin (see team-game-performance-tracking). Teams with no graded
// games are excluded rather than shown with a zero average. In
// DATA_SOURCE=espn mode there is no persisted performance data, so this
// returns an empty leaderboard.
export async function GET(request: Request) {
  try {
    if (isEspnOnly()) {
      return NextResponse.json({ year: currentSeasonYear(), teams: [] });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam && Number.isInteger(Number(yearParam)) ? Number(yearParam) : currentSeasonYear();

    const season = await prisma.season.findUnique({
      where: { year_type: { year, type: "REGULAR" } },
      select: { id: true },
    });
    if (!season) {
      return NextResponse.json({ year, teams: [] });
    }

    const grouped = await prisma.teamGamePerformance.groupBy({
      by: ["teamId"],
      where: { seasonId: season.id },
      _avg: { coverMargin: true },
      _count: { _all: true },
    });

    const teams = await prisma.team.findMany({
      where: { id: { in: grouped.map((g) => g.teamId) } },
      select: { id: true, displayName: true, abbreviation: true, logoUrl: true, color: true, alternateColor: true },
    });
    const teamById = new Map(teams.map((t) => [t.id, t]));

    const ranked = grouped
      .flatMap((g) => {
        const team = teamById.get(g.teamId);
        const average = g._avg.coverMargin;
        if (!team || average === null) return [];
        return [{ team, averageCoverMargin: average, games: g._count._all, label: averageLabel(average) }];
      })
      .sort((a, b) => b.averageCoverMargin - a.averageCoverMargin || a.team.id - b.team.id)
      .map((entry, index) => ({ rank: index + 1, ...entry }));

    return NextResponse.json({ year, teams: ranked });
  } catch (error) {
    console.error("GET /api/teams/performance failed:", error);
    return NextResponse.json({ error: "Failed to load team performance" }, { status: 500 });
  }
}
