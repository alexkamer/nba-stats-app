import { prisma } from "@/lib/db";
import { getTeamTransactions } from "@/lib/espn-team-transactions";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();

  try {
    const team = await prisma.team.findUnique({ where: { id }, select: { espnId: true } });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const transactions = await getTeamTransactions(team.espnId, year);
    return NextResponse.json({ transactions });
  } catch {
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}
