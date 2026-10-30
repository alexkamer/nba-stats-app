import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getNbaCupStandingsLive } from "@/lib/espn-standings-live";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    if (isEspnOnly()) {
      return NextResponse.json(await getNbaCupStandingsLive());
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");

    // NBA Cup only exists from the 2023-24 season (year 2024) on — a
    // separate season selector from the main standings page, which goes
    // back to 2003.
    const seasonsWithNbaCup = await prisma.nbaCupStanding.findMany({
      distinct: ["seasonId"],
      select: { season: { select: { id: true, year: true, type: true } } },
      orderBy: { season: { year: "desc" } },
    });
    const availableSeasons = seasonsWithNbaCup.map((s) => s.season);

    if (availableSeasons.length === 0) {
      return NextResponse.json({ availableSeasons: [], groups: [] });
    }

    const season = yearParam
      ? availableSeasons.find((s) => s.year === Number(yearParam)) ?? availableSeasons[0]
      : availableSeasons[0];

    const standings = await prisma.nbaCupStanding.findMany({
      where: { seasonId: season.id },
      include: { team: true },
      orderBy: { seed: "asc" },
    });

    const identities = await resolveTeamIdentities(standings.map((s) => s.teamId), season.year);

    const groupMap = new Map<string, unknown[]>();
    for (const standing of standings) {
      const identity = identities.get(standing.teamId);
      const group = groupMap.get(standing.groupName) ?? [];
      group.push({
        ...standing,
        team: identity ? { ...standing.team, ...identity } : standing.team,
      });
      groupMap.set(standing.groupName, group);
    }

    return NextResponse.json({
      season,
      availableSeasons,
      groups: Array.from(groupMap.entries()).map(([groupName, standings]) => ({ groupName, standings })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load NBA Cup standings" }, { status: 500 });
  }
}
