import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getTeamsLive } from "@/lib/espn-teams-list";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    if (isEspnOnly()) {
      const teams = await getTeamsLive();
      return NextResponse.json({ teams });
    }

    const teams = await prisma.team.findMany({
      include: { division: { include: { conference: true } } },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ error: "Failed to load teams" }, { status: 500 });
  }
}
