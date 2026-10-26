import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // "Latest season" by year isn't the same as "latest season with
    // standings data" — a new Season row can exist (created the moment its
    // first game goes final, per the incremental sync) well before
    // sync-aggregates has populated standings for it. Find the latest
    // season that actually has standings rows.
    const latestStanding = await prisma.standing.findFirst({
      orderBy: { season: { year: "desc" } },
      include: { season: true },
    });
    if (!latestStanding) {
      return NextResponse.json({ conferences: [] });
    }
    const latestSeason = latestStanding.season;

    const standings = await prisma.standing.findMany({
      where: { seasonId: latestSeason.id },
      include: { team: { include: { division: { include: { conference: true } } } } },
      orderBy: { conferenceRank: "asc" },
    });

    const conferenceMap = new Map<string, { conferenceName: string; standings: typeof standings }>();
    for (const standing of standings) {
      const conferenceName = standing.team.division?.conference?.name ?? "Unknown";
      const group = conferenceMap.get(conferenceName) ?? { conferenceName, standings: [] };
      group.standings.push(standing);
      conferenceMap.set(conferenceName, group);
    }

    return NextResponse.json({
      season: latestSeason,
      conferences: Array.from(conferenceMap.values()),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load standings" }, { status: 500 });
  }
}
