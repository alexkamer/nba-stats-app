import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getStandingsLive } from "@/lib/espn-standings-live";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    if (isEspnOnly()) {
      return NextResponse.json(await getStandingsLive());
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");

    // All seasons that actually have standings data, for the season
    // selector — distinct from "every Season row," since a row can exist
    // (created the moment a game goes final) before sync-aggregates has
    // populated standings for it (confirmed during historical backfill).
    const seasonsWithStandings = await prisma.standing.findMany({
      distinct: ["seasonId"],
      select: { season: { select: { id: true, year: true, type: true } } },
      orderBy: { season: { year: "desc" } },
    });
    const availableSeasons = seasonsWithStandings.map((s) => s.season);

    if (availableSeasons.length === 0) {
      return NextResponse.json({ availableSeasons: [], conferences: [] });
    }

    const season = yearParam
      ? availableSeasons.find((s) => s.year === Number(yearParam)) ?? availableSeasons[0]
      : availableSeasons[0];

    const [standings, teamSeasonStats] = await Promise.all([
      prisma.standing.findMany({
        where: { seasonId: season.id },
        include: { team: { include: { division: { include: { conference: true } } } } },
        orderBy: { conferenceRank: "asc" },
      }),
      prisma.teamSeasonStat.findMany({
        where: { seasonId: season.id },
        select: { teamId: true, pointsPerGame: true, oppPointsPerGame: true },
      }),
    ]);

    // Team espnIds are stable across relocation/rename (e.g. Seattle
    // SuperSonics -> OKC Thunder) — show the era-accurate name/logo for
    // this season's year rather than always the current branding.
    const identities = await resolveTeamIdentities(standings.map((s) => s.teamId), season.year);
    const statsByTeamId = new Map(teamSeasonStats.map((s) => [s.teamId, s]));

    const conferenceMap = new Map<string, { conferenceName: string; standings: unknown[] }>();
    for (const standing of standings) {
      const conferenceName = standing.team.division?.conference?.name ?? "Unknown";
      const group = conferenceMap.get(conferenceName) ?? { conferenceName, standings: [] };
      const identity = identities.get(standing.teamId);
      const stats = statsByTeamId.get(standing.teamId);
      group.standings.push({
        ...standing,
        team: identity ? { ...standing.team, ...identity } : standing.team,
        pointsPerGame: stats?.pointsPerGame ?? null,
        oppPointsPerGame: stats?.oppPointsPerGame ?? null,
      });
      conferenceMap.set(conferenceName, group);
    }

    return NextResponse.json({
      season,
      availableSeasons,
      conferences: Array.from(conferenceMap.values()),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load standings" }, { status: 500 });
  }
}
