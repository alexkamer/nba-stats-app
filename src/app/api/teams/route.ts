import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const teams = await prisma.team.findMany({
      include: { division: { include: { conference: true } } },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ error: "Failed to load teams" }, { status: 500 });
  }
}
