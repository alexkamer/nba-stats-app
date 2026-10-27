import { prisma } from "@/lib/db";
import { getUpcomingGames } from "@/lib/espn-schedule";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

interface EspnStatValue {
  name: string;
  value: number;
}
interface EspnStatCategory {
  name: string;
  stats: EspnStatValue[];
}

const EXTRA_STAT_NAMES = [
  "gamesStarted",
  "avgMinutes",
  "avgFieldGoalsMade",
  "avgFieldGoalsAttempted",
  "avgThreePointFieldGoalsMade",
  "avgThreePointFieldGoalsAttempted",
  "avgFreeThrowsMade",
  "avgFreeThrowsAttempted",
  "avgFouls",
  "avgOffensiveRebounds",
  "avgDefensiveRebounds",
  "fieldGoalsMade",
  "fieldGoalsAttempted",
  "threePointFieldGoalsMade",
  "threePointFieldGoalsAttempted",
  "freeThrowsMade",
  "freeThrowsAttempted",
  "offensiveRebounds",
  "defensiveRebounds",
  "rebounds",
  "assists",
  "blocks",
  "steals",
  "fouls",
  "turnovers",
  "points",
  "doubleDouble",
  "tripleDouble",
  "disqualifications",
  "ejections",
  "technicalFouls",
  "flagrantFouls",
  "assistTurnoverRatio",
  "stealTurnoverRatio",
  "scoringEfficiency",
  "shootingEfficiency",
] as const;
type ExtraStatName = (typeof EXTRA_STAT_NAMES)[number];

function extractExtraStats(extra: string | null): Record<ExtraStatName, number | null> {
  const result = Object.fromEntries(EXTRA_STAT_NAMES.map((name) => [name, null])) as Record<
    ExtraStatName,
    number | null
  >;
  if (!extra) return result;
  let categories: EspnStatCategory[];
  try {
    categories = JSON.parse(extra);
  } catch {
    return result;
  }
  const allStats = categories.flatMap((cat) => cat.stats);
  for (const name of EXTRA_STAT_NAMES) {
    const stat = allStats.find((s) => s.name === name);
    if (stat) result[name] = stat.value;
  }
  return result;
}

export async function GET(_request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const id = Number(athleteId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  try {
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        currentTeam: true,
        position: true,
        playerSeasonStats: { orderBy: { season: { year: "desc" } }, include: { season: true, team: true } },
      },
    });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // A player who was traded mid-season has one PlayerSeasonStat row (ESPN's
    // season-stats endpoint already combines the season across teams), but
    // played games for more than one team — recover that list from the game
    // log so the Stats tab can show e.g. "BOS/LAL" instead of just the last team.
    const seasonGameTeams = await prisma.playerGameStat.findMany({
      where: { playerId: id },
      orderBy: { game: { date: "asc" } },
      select: { teamId: true, game: { select: { seasonId: true } } },
    });
    const teamIdsBySeasonId = new Map<number, number[]>();
    for (const { teamId, game } of seasonGameTeams) {
      const list = teamIdsBySeasonId.get(game.seasonId) ?? [];
      if (!list.includes(teamId)) list.push(teamId);
      teamIdsBySeasonId.set(game.seasonId, list);
    }

    const seasonYears = [...new Set(player.playerSeasonStats.map((s) => s.season.year))];
    const seasonTeamIds = [
      ...new Set([
        ...player.playerSeasonStats.map((s) => s.teamId),
        ...[...teamIdsBySeasonId.values()].flat(),
      ]),
    ];
    const identitiesBySeasonYear = new Map(
      await Promise.all(seasonYears.map(async (year) => [year, await resolveTeamIdentities(seasonTeamIds, year)] as const)),
    );
    const playerSeasonStatsWithIdentity = player.playerSeasonStats.map((stat) => {
      const identities = identitiesBySeasonYear.get(stat.season.year);
      const teamIdsPlayed = teamIdsBySeasonId.get(stat.seasonId) ?? [stat.teamId];
      const teams = teamIdsPlayed
        .map((teamId) => {
          const identity = identities?.get(teamId);
          return identity
            ? { id: teamId, abbreviation: identity.abbreviation, displayName: identity.displayName, logoUrl: identity.logoUrl }
            : null;
        })
        .filter((t) => t != null);
      if (teams.length === 0)
        teams.push({ id: stat.teamId, abbreviation: stat.team.abbreviation, displayName: stat.team.displayName, logoUrl: stat.team.logoUrl });
      const primaryIdentity = identities?.get(stat.teamId);
      return {
        ...stat,
        team: primaryIdentity ? { ...stat.team, ...primaryIdentity } : stat.team,
        teams,
        extraStats: extractExtraStats(stat.extra),
      };
    });

    const currentSeasonStat = player.playerSeasonStats[0] ?? null;
    type RankKey = "pointsPerGame" | "reboundsPerGame" | "assistsPerGame" | "fieldGoalPct";
    let seasonRanks: Record<RankKey, { rank: number; tied: boolean } | null> = {
      pointsPerGame: null,
      reboundsPerGame: null,
      assistsPerGame: null,
      fieldGoalPct: null,
    };
    if (currentSeasonStat) {
      const peers = await prisma.playerSeasonStat.findMany({
        where: { seasonId: currentSeasonStat.seasonId, gamesPlayed: { gt: 0 } },
        select: { pointsPerGame: true, reboundsPerGame: true, assistsPerGame: true, fieldGoalPct: true },
      });
      const rank = (key: RankKey) => {
        const value = currentSeasonStat[key];
        if (value == null) return null;
        const values = peers.map((p) => p[key]).filter((v): v is number => v != null);
        const higher = values.filter((v) => v > value).length;
        const equal = values.filter((v) => v === value).length;
        return { rank: higher + 1, tied: equal > 1 };
      };
      seasonRanks = {
        pointsPerGame: rank("pointsPerGame"),
        reboundsPerGame: rank("reboundsPerGame"),
        assistsPerGame: rank("assistsPerGame"),
        fieldGoalPct: rank("fieldGoalPct"),
      };
    }

    const recentGames = await prisma.playerGameStat.findMany({
      where: { playerId: id },
      orderBy: { game: { date: "desc" } },
      take: 20,
      include: { game: { include: { homeTeam: true, awayTeam: true, season: true } }, team: true },
    });

    // Team espnIds are stable across relocation/rename — show the
    // era-accurate name for each game's season year, not always current.
    const teamIds = [...new Set(recentGames.flatMap((g) => [g.game.homeTeamId, g.game.awayTeamId]))];
    const years = [...new Set(recentGames.map((g) => g.game.season.year))];
    const identitiesByYear = new Map(
      await Promise.all(years.map(async (year) => [year, await resolveTeamIdentities(teamIds, year)] as const)),
    );
    const recentGamesWithIdentity = recentGames.map((g) => {
      const identities = identitiesByYear.get(g.game.season.year);
      const homeIdentity = identities?.get(g.game.homeTeamId);
      const awayIdentity = identities?.get(g.game.awayTeamId);
      return {
        ...g,
        game: {
          ...g.game,
          homeTeam: homeIdentity ? { ...g.game.homeTeam, ...homeIdentity } : g.game.homeTeam,
          awayTeam: awayIdentity ? { ...g.game.awayTeam, ...awayIdentity } : g.game.awayTeam,
        },
      };
    });

    // Best-effort: an ESPN hiccup here shouldn't take down the whole page.
    let nextGame: Awaited<ReturnType<typeof getUpcomingGames>>[number] | null = null;
    if (player.currentTeam && currentSeasonStat) {
      try {
        const upcoming = await getUpcomingGames(player.currentTeam.espnId, currentSeasonStat.season.year);
        nextGame = upcoming[0] ?? null;
      } catch {
        nextGame = null;
      }
    }

    return NextResponse.json({
      player: { ...player, playerSeasonStats: playerSeasonStatsWithIdentity },
      recentGames: recentGamesWithIdentity,
      seasonRanks,
      nextGame,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load player" }, { status: 500 });
  }
}
