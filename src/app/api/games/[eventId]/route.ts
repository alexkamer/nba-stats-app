import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// DB-backed branch only (M7) — serves games already ingested as `final`.
// The live-proxy branch for scheduled/in-progress games (SPEC.md Sec 4) is
// M8, not yet implemented; such an espnId will 404 here until then.
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

    if (!game) {
      return NextResponse.json(
        { error: "Game not found in database (not yet final, or live-path not implemented — see M8)" },
        { status: 404 },
      );
    }

    return NextResponse.json({ game });
  } catch {
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
