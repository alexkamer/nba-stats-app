import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { currentSeasonYear } from "@/lib/espn-season";
import { summarizePerformance, summarizeSeasonTrend } from "@lib/accuracy/performance-summary";
import { NextResponse } from "next/server";

// Serves the team-performance-views capability's Performance tab: the
// team's regular-season summary and splits plus its chronological per-game
// rows (see team-game-performance-tracking). Accepts `?year=` like the
// parent team route and defaults to the current season. In
// DATA_SOURCE=espn mode there is no persisted performance data, so this
// returns an empty result.
export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam && Number.isInteger(Number(yearParam)) ? Number(yearParam) : currentSeasonYear();

    const emptySummary = summarizePerformance([]);
    if (isEspnOnly()) {
      return NextResponse.json({ year, summary: emptySummary, games: [], seasonTrend: [] });
    }

    // Independent of `year` — rolls up every season the team has graded
    // games in, not just the one currently selected on the tab.
    const allRows = await prisma.teamGamePerformance.findMany({
      where: { teamId: id },
      select: { coverMargin: true, season: { select: { year: true } } },
    });
    const seasonTrend = summarizeSeasonTrend(allRows.map((r) => ({ year: r.season.year, coverMargin: r.coverMargin })));

    const season = await prisma.season.findUnique({
      where: { year_type: { year, type: "REGULAR" } },
      select: { id: true },
    });
    if (!season) {
      return NextResponse.json({ year, summary: emptySummary, games: [], seasonTrend });
    }

    const rows = await prisma.teamGamePerformance.findMany({
      where: { teamId: id, seasonId: season.id },
      include: {
        tags: { select: { tag: true } },
        game: { select: { id: true, espnId: true, date: true, homeScore: true, awayScore: true } },
      },
      orderBy: { game: { date: "asc" } },
    });

    const opponentIds = [...new Set(rows.map((r) => r.opponentTeamId))];
    const opponents = await prisma.team.findMany({
      where: { id: { in: opponentIds } },
      select: { id: true, displayName: true, abbreviation: true, logoUrl: true },
    });
    const opponentById = new Map(opponents.map((t) => [t.id, t]));

    const summary = summarizePerformance(
      rows.map((r) => ({ date: r.game.date, coverMargin: r.coverMargin, isFavorite: r.isFavorite, isHome: r.isHome })),
    );

    const games = rows.map((r) => ({
      gameId: r.game.id,
      espnId: r.game.espnId,
      date: r.game.date,
      opponent: opponentById.get(r.opponentTeamId) ?? null,
      isHome: r.isHome,
      isFavorite: r.isFavorite,
      teamScore: r.isHome ? r.game.homeScore : r.game.awayScore,
      opponentScore: r.isHome ? r.game.awayScore : r.game.homeScore,
      spread: r.spread,
      expectedMargin: r.expectedMargin,
      actualMargin: r.actualMargin,
      coverMargin: r.coverMargin,
      label: r.label,
      tags: r.tags.map((t) => t.tag),
    }));

    return NextResponse.json({ year, summary, games, seasonTrend });
  } catch (error) {
    console.error("GET /api/teams/[teamId]/performance failed:", error);
    return NextResponse.json({ error: "Failed to load team performance" }, { status: 500 });
  }
}
