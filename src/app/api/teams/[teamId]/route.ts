import { prisma } from "@/lib/db";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { getTeamLeaders } from "@/lib/espn-team-leaders";
import { NextResponse } from "next/server";

// ESPN's own leaders endpoint is the source of truth for who leads the
// team in a stat (it applies a qualifying threshold we don't replicate
// locally) — see src/lib/espn-team-leaders.ts. Category names are ESPN's.
const LEADER_CATEGORY_DEFS = [
  { group: "offense" as const, key: "pointsPerGame" },
  { group: "offense" as const, key: "assistsPerGame" },
  { group: "offense" as const, key: "fieldGoalPercentage" },
  { group: "defense" as const, key: "reboundsPerGame" },
  { group: "defense" as const, key: "stealsPerGame" },
  { group: "defense" as const, key: "blocksPerGame" },
];

// `extra` on TeamSeasonStat/PlayerSeasonStat is ESPN's raw category tree
// (categories -> stats[]), not a flat map — walk it once per lookup rather
// than reshaping the whole structure for the handful of fields surfaced.
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

function fixed1(value: number | null | undefined): string | null {
  return value == null ? null : value.toFixed(1);
}

type LeaderSeasonStat = {
  extra: string | null;
  pointsPerGame: number | null;
  reboundsPerGame: number | null;
  stealsPerGame: number | null;
  fieldGoalPct: number | null;
  turnoversPerGame: number | null;
};

// The small "context" line under each leader's headline stat — distinct
// per category so e.g. the assists leader shows TO (not FG%). minutesPerGame
// isn't a stored column, only present inside `extra`'s ESPN category tree.
const LEADER_SECONDARY_STATS: Record<string, { label: string; pick: (s: LeaderSeasonStat | null) => string | null }[]> = {
  pointsPerGame: [
    { label: "MIN", pick: (s) => findStat(s?.extra ?? null, "avgMinutes") },
    { label: "FG%", pick: (s) => fixed1(s?.fieldGoalPct) },
  ],
  assistsPerGame: [
    { label: "PPG", pick: (s) => fixed1(s?.pointsPerGame) },
    { label: "TO", pick: (s) => fixed1(s?.turnoversPerGame) },
  ],
  fieldGoalPercentage: [
    { label: "MIN", pick: (s) => findStat(s?.extra ?? null, "avgMinutes") },
    { label: "PPG", pick: (s) => fixed1(s?.pointsPerGame) },
  ],
  reboundsPerGame: [
    { label: "DRPG", pick: (s) => findStat(s?.extra ?? null, "avgDefensiveRebounds") },
    { label: "ORPG", pick: (s) => findStat(s?.extra ?? null, "avgOffensiveRebounds") },
  ],
  stealsPerGame: [
    { label: "MIN", pick: (s) => findStat(s?.extra ?? null, "avgMinutes") },
    { label: "TO", pick: (s) => fixed1(s?.turnoversPerGame) },
  ],
  blocksPerGame: [
    { label: "STL", pick: (s) => fixed1(s?.stealsPerGame) },
    { label: "REB", pick: (s) => fixed1(s?.reboundsPerGame) },
  ],
};

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
        teamLeaders: [],
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

    // Best-effort — an ESPN hiccup here shouldn't take down the whole page.
    let teamLeadersRaw: Awaited<ReturnType<typeof getTeamLeaders>> = new Map();
    try {
      teamLeadersRaw = await getTeamLeaders(team.espnId, season.year);
    } catch {
      teamLeadersRaw = new Map();
    }
    const leaderAthleteEspnIds = [...new Set([...teamLeadersRaw.values()].map((l) => l.athleteEspnId))];
    const leaderPlayers = leaderAthleteEspnIds.length
      ? await prisma.player.findMany({
          where: { espnId: { in: leaderAthleteEspnIds } },
          include: { position: true, playerSeasonStats: { where: { seasonId: season.id, teamId: id } } },
        })
      : [];
    const leaderPlayerByEspnId = new Map(leaderPlayers.map((p) => [p.espnId, p]));
    const teamLeaders = LEADER_CATEGORY_DEFS.map(({ group, key }) => {
      const entry = teamLeadersRaw.get(key);
      const player = entry ? leaderPlayerByEspnId.get(entry.athleteEspnId) ?? null : null;
      const seasonStat = player?.playerSeasonStats[0] ?? null;
      const secondaryDefs = LEADER_SECONDARY_STATS[key] ?? [];
      return {
        group,
        statName: entry?.categoryDisplayName ?? key,
        player: player
          ? {
              id: player.id,
              displayName: player.displayName,
              headshotUrl: player.headshotUrl,
              jersey: player.jersey,
              position: player.position,
            }
          : null,
        displayValue: entry?.displayValue ?? null,
        secondary: secondaryDefs.map((d) => ({ label: d.label, value: d.pick(seasonStat) })),
      };
    });

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
      teamLeaders,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
