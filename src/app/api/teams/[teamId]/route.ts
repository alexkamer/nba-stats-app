import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        division: { include: { conference: true } },
        venue: true,
        players: { orderBy: { displayName: "asc" } },
        standings: { orderBy: { season: { year: "desc" } }, take: 1, include: { season: true } },
        teamSeasonStats: { orderBy: { season: { year: "desc" } }, take: 1, include: { season: true } },
      },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Completed games only (SPEC.md Sec 9.5) — most recent first.
    const recentGames = await prisma.game.findMany({
      where: { OR: [{ homeTeamId: id }, { awayTeamId: id }] },
      orderBy: { date: "desc" },
      take: 10,
      include: { homeTeam: true, awayTeam: true },
    });

    return NextResponse.json({ team, recentGames });
  } catch {
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
