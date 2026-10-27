import { prisma } from "@/lib/db";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

// `extra` on TeamSeasonStat is ESPN's raw category tree (categories ->
// stats[]), not a flat map — walk it once per lookup rather than reshaping
// the whole structure for the handful of fields the page surfaces.
function findStat(extraJson: string | null, statName: string): string | null {
  if (!extraJson) return null;
  try {
    const categories = JSON.parse(extraJson) as { stats?: { name: string; displayValue?: string }[] }[];
    for (const category of categories) {
      const stat = category.stats?.find((s) => s.name === statName);
      if (stat?.displayValue) return stat.displayValue;
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id },
      include: { division: { include: { conference: true } }, venue: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Seasons this team actually has standings for, newest first — same
    // "standings table is the source of truth for availability" rule the
    // /api/standings route uses, scoped to this team.
    const seasonsWithStandings = await prisma.standing.findMany({
      where: { teamId: id },
      distinct: ["seasonId"],
      select: { season: { select: { id: true, year: true, type: true } } },
      orderBy: { season: { year: "desc" } },
    });
    const availableSeasons = seasonsWithStandings.map((s) => s.season);

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const season = yearParam
      ? availableSeasons.find((s) => s.year === Number(yearParam)) ?? availableSeasons[0]
      : availableSeasons[0];

    if (!season) {
      return NextResponse.json({
        team,
        availableSeasons: [],
        season: null,
        schedule: [],
        roster: [],
        divisionStandings: [],
        news: [],
      });
    }

    const [identities, standing, teamSeasonStat, nbaCupStanding, players, schedule, divisionStandings, newsLinks] =
      await Promise.all([
        resolveTeamIdentities([id], season.year),
        prisma.standing.findUnique({ where: { teamId_seasonId: { teamId: id, seasonId: season.id } } }),
        prisma.teamSeasonStat.findUnique({ where: { teamId_seasonId: { teamId: id, seasonId: season.id } } }),
        prisma.nbaCupStanding.findUnique({ where: { teamId_seasonId: { teamId: id, seasonId: season.id } } }),
        prisma.player.findMany({
          where: { currentTeamId: id },
          include: { position: true, playerSeasonStats: { where: { seasonId: season.id, teamId: id } } },
          orderBy: { displayName: "asc" },
        }),
        prisma.game.findMany({
          where: { seasonId: season.id, OR: [{ homeTeamId: id }, { awayTeamId: id }] },
          orderBy: { date: "asc" },
          include: { homeTeam: true, awayTeam: true },
        }),
        team.divisionId
          ? prisma.standing.findMany({
              where: { seasonId: season.id, team: { divisionId: team.divisionId } },
              include: { team: true },
              orderBy: { divisionRank: "asc" },
            })
          : Promise.resolve([]),
        prisma.newsArticleTeam.findMany({
          where: { teamId: id },
          orderBy: { newsArticle: { publishedAt: "desc" } },
          take: 8,
          include: { newsArticle: true },
        }),
      ]);

    const identity = identities.get(id);
    const teamWithIdentity = identity ? { ...team, ...identity } : team;

    const roster = players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      jersey: p.jersey,
      position: p.position,
      seasonStat: p.playerSeasonStats[0] ?? null,
    }));

    // Opponents (schedule + division standings) should show the
    // era-accurate identity for this season's year, same as the team header.
    const opponentIds = [
      ...new Set([...schedule.flatMap((g) => [g.homeTeamId, g.awayTeamId]), ...divisionStandings.map((s) => s.teamId)]),
    ];
    const opponentIdentities = await resolveTeamIdentities(opponentIds, season.year);
    const scheduleWithIdentities = schedule.map((g) => ({
      ...g,
      homeTeam: { ...g.homeTeam, ...(opponentIdentities.get(g.homeTeamId) ?? {}) },
      awayTeam: { ...g.awayTeam, ...(opponentIdentities.get(g.awayTeamId) ?? {}) },
    }));
    const divisionStandingsWithIdentities = divisionStandings.map((s) => ({
      ...s,
      team: { ...s.team, ...(opponentIdentities.get(s.teamId) ?? {}) },
    }));

    const extendedStats = teamSeasonStat
      ? {
          fieldGoalPct: findStat(teamSeasonStat.extra, "fieldGoalPct"),
          threePointPct: findStat(teamSeasonStat.extra, "threePointPct"),
          freeThrowPct: findStat(teamSeasonStat.extra, "freeThrowPct"),
          reboundsPerGame: findStat(teamSeasonStat.extra, "avgRebounds"),
          assistsPerGame: findStat(teamSeasonStat.extra, "avgAssists"),
          turnoversPerGame: findStat(teamSeasonStat.extra, "avgTurnovers"),
          stealsPerGame: findStat(teamSeasonStat.extra, "avgSteals"),
          blocksPerGame: findStat(teamSeasonStat.extra, "avgBlocks"),
        }
      : null;

    const news = newsLinks.map((link) => ({
      id: link.newsArticle.id,
      headline: link.newsArticle.headline,
      description: link.newsArticle.description,
      url: link.newsArticle.url,
      imageUrl: link.newsArticle.imageUrl,
      publishedAt: link.newsArticle.publishedAt,
    }));

    return NextResponse.json({
      team: teamWithIdentity,
      season,
      availableSeasons,
      standing,
      teamSeasonStat,
      extendedStats,
      nbaCupStanding,
      roster,
      schedule: scheduleWithIdentities,
      divisionStandings: divisionStandingsWithIdentities,
      news,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
