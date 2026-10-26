import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const id = Number(athleteId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  try {
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        currentTeam: true,
        position: true,
        playerSeasonStats: { orderBy: { season: { year: "desc" } }, include: { season: true } },
      },
    });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const recentGames = await prisma.playerGameStat.findMany({
      where: { playerId: id },
      orderBy: { game: { date: "desc" } },
      take: 20,
      include: { game: { include: { homeTeam: true, awayTeam: true } }, team: true },
    });

    return NextResponse.json({ player, recentGames });
  } catch {
    return NextResponse.json({ error: "Failed to load player" }, { status: 500 });
  }
}
