import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Serves the betting-history-page capability's today's-birthdays section:
// active players whose birth month and day match today. No backing
// tracking capability — `Player.birthDate`/`active` already exist, so this
// is filtered in JS over the (small) active-player set rather than a raw
// SQL date-part comparison.
export async function GET() {
  try {
    const now = new Date();
    const players = await prisma.player.findMany({
      where: { active: true, birthDate: { not: null } },
      select: { id: true, espnId: true, displayName: true, headshotUrl: true, birthDate: true, currentTeamId: true },
    });

    const birthdays = players.filter(
      (p) => p.birthDate!.getMonth() === now.getMonth() && p.birthDate!.getDate() === now.getDate(),
    );

    return NextResponse.json({ players: birthdays });
  } catch (error) {
    console.error("GET /api/betting/history/birthdays failed:", error);
    return NextResponse.json({ error: "Failed to load birthdays" }, { status: 500 });
  }
}
