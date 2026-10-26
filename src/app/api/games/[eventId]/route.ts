import { prisma } from "@/lib/db";
import { getLiveGameDetail } from "@/lib/espn-live";
import { NextResponse } from "next/server";

// Branches per SPEC.md Sec 4: `final` games are served from the DB
// (ingested by the sync jobs); anything else (scheduled/in-progress, or
// simply not ingested yet) falls back to the live ESPN proxy, which is
// never persisted.
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  try {
    const game = await prisma.game.findUnique({
      where: { espnId: eventId },
      include: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        teamGameStats: { include: { team: true } },
        playerGameStats: { include: { player: true, team: true } },
        plays: { orderBy: { sequenceNumber: "asc" } },
      },
    });

    if (game) {
      return NextResponse.json({ game, source: "db" });
    }

    const liveGame = await getLiveGameDetail(eventId);
    if (!liveGame) {
      return NextResponse.json({ error: "Game not found (unknown espnId)" }, { status: 404 });
    }
    return NextResponse.json({ game: liveGame, source: "live" });
  } catch {
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
