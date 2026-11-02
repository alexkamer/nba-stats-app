import { prisma } from "@/lib/db";
import { currentSeasonYear } from "@/lib/espn-season";
import { NextResponse } from "next/server";

// Serves the betting-history-page capability's team ATS/O-U records
// section: every team's current-season `TeamCoverRecord` (see
// team-cover-record-tracking), joined with display info. Scoped to the
// current regular season only — this page doesn't support browsing past
// seasons (see design.md "Non-Goals").
export async function GET() {
  try {
    const season = await prisma.season.findUnique({
      where: { year_type: { year: currentSeasonYear(), type: "REGULAR" } },
      select: { id: true },
    });

    if (!season) {
      return NextResponse.json({ records: [] });
    }

    const records = await prisma.teamCoverRecord.findMany({
      where: { seasonId: season.id },
      include: { team: { select: { id: true, espnId: true, abbreviation: true, name: true, logoUrl: true } } },
      orderBy: { teamId: "asc" },
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error("GET /api/betting/history/team-cover-records failed:", error);
    return NextResponse.json({ error: "Failed to load team cover records" }, { status: 500 });
  }
}
