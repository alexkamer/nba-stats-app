import { prisma } from "@/lib/db";
import { getPlayerAwards } from "@/lib/espn-player-awards";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const id = Number(athleteId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({ where: { id }, select: { espnId: true } });
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  try {
    const awards = await getPlayerAwards(player.espnId);
    return NextResponse.json({ awards });
  } catch {
    return NextResponse.json({ awards: [] });
  }
}
