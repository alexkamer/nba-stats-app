import { prisma } from "@/lib/db";
import { getPlayerGamelog } from "@/lib/espn-player-gamelog";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const id = Number(athleteId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({ where: { id }, select: { espnId: true } });
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") ?? undefined;

  try {
    const gamelog = await getPlayerGamelog(player.espnId, { season });
    return NextResponse.json(gamelog);
  } catch {
    return NextResponse.json({ labels: [], seasonTypes: [], filters: [] });
  }
}
