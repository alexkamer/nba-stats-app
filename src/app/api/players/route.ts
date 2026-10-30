import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getActivePlayersLive } from "@/lib/espn-players-list";
import { NextResponse } from "next/server";

// Full list returned in one shot — client-side search per SPEC.md Sec 9.2
// (fetch once, filter in the browser, no per-keystroke server round-trip).
export async function GET() {
  try {
    if (isEspnOnly()) {
      const players = await getActivePlayersLive();
      return NextResponse.json({ players });
    }

    const players = await prisma.player.findMany({
      where: { active: true },
      include: { currentTeam: true, position: true },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ error: "Failed to load players" }, { status: 500 });
  }
}
