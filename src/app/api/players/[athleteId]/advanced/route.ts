import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

interface EspnStatValue {
  name: string;
  value: number;
}
interface EspnStatCategory {
  name: string;
  stats: EspnStatValue[];
}

function statValue(categories: EspnStatCategory[], name: string): number | null {
  const stat = categories.flatMap((cat) => cat.stats).find((s) => s.name === name);
  return stat ? stat.value : null;
}

function parseExtra(extra: string | null): EspnStatCategory[] {
  if (!extra) return [];
  try {
    return JSON.parse(extra);
  } catch {
    return [];
  }
}

export interface AdvancedStatRow {
  seasonId: number;
  seasonYear: number;
  seasonType: string;
  gamesPlayed: number | null;
  per40Points: number | null;
  per40Rebounds: number | null;
  per40Assists: number | null;
  trueShootingPct: number | null;
  assistPct: number | null;
  turnoverPct: number | null;
  usagePct: number | null;
  reboundPct: number | null;
}

async function leaguePaceForSeason(seasonId: number): Promise<number | null> {
  const teamSeasonStats = await prisma.teamSeasonStat.findMany({ where: { seasonId }, select: { extra: true } });
  const paces = teamSeasonStats.map((t) => statValue(parseExtra(t.extra), "paceFactor")).filter((p): p is number => p != null);
  return paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const id = Number(athleteId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }

  const seasonStats = await prisma.playerSeasonStat.findMany({
    where: { playerId: id },
    orderBy: { season: { year: "asc" } },
    include: { season: true },
  });

  const leaguePaceCache = new Map<number, number | null>();
  const rows: AdvancedStatRow[] = [];

  for (const stat of seasonStats) {
    const player = parseExtra(stat.extra);
    const playerGamesPlayed = stat.gamesPlayed;
    const playerAvgMinutes = statValue(player, "avgMinutes");
    const playerMinutes = playerAvgMinutes != null && playerGamesPlayed != null ? playerAvgMinutes * playerGamesPlayed : null;
    const playerPoints = statValue(player, "points");
    const playerRebounds = statValue(player, "rebounds");
    const playerAssists = statValue(player, "assists");
    const playerTurnovers = statValue(player, "turnovers");
    const playerFga = statValue(player, "fieldGoalsAttempted");
    const playerFta = statValue(player, "freeThrowsAttempted");

    const teamSeasonStat = await prisma.teamSeasonStat.findUnique({
      where: { teamId_seasonId: { teamId: stat.teamId, seasonId: stat.seasonId } },
    });
    const team = parseExtra(teamSeasonStat?.extra ?? null);
    const teamGamesPlayed = statValue(team, "gamesPlayed");
    const teamMinutes = teamGamesPlayed != null ? teamGamesPlayed * 240 : null;
    const teamRebounds = statValue(team, "totalRebounds") ?? statValue(team, "rebounds");
    const teamPace = statValue(team, "paceFactor");

    if (!leaguePaceCache.has(stat.seasonId)) {
      leaguePaceCache.set(stat.seasonId, await leaguePaceForSeason(stat.seasonId));
    }
    const leaguePace = leaguePaceCache.get(stat.seasonId) ?? null;

    const teamGameIds = (
      await prisma.teamGameStat.findMany({
        where: { teamId: stat.teamId, game: { seasonId: stat.seasonId } },
        select: { gameId: true },
      })
    ).map((g) => g.gameId);
    const oppRebounds =
      teamGameIds.length > 0
        ? (
            await prisma.teamGameStat.aggregate({
              where: { gameId: { in: teamGameIds }, teamId: { not: stat.teamId } },
              _sum: { rebounds: true },
            })
          )._sum.rebounds
        : null;

    const per40 = (total: number | null): number | null => (total != null && playerMinutes ? (total / playerMinutes) * 40 : null);

    // Assist Ratio / Turnover Ratio: share of a player's own possessions
    // (FGA + FTA*0.44 + AST + TOV) that end in an assist or a turnover.
    const possessions =
      playerFga != null && playerFta != null && playerAssists != null && playerTurnovers != null
        ? playerFga + 0.44 * playerFta + playerAssists + playerTurnovers
        : null;

    const assistPct = playerAssists != null && possessions ? (100 * playerAssists) / possessions : null;
    const turnoverPct = playerTurnovers != null && possessions ? (100 * playerTurnovers) / possessions : null;

    // True Shooting %: (PTS * 50) / (FGA + FTA*0.44).
    const trueShootingDenominator = playerFga != null && playerFta != null ? playerFga + 0.44 * playerFta : null;
    const trueShootingPct = playerPoints != null && trueShootingDenominator ? (50 * playerPoints) / trueShootingDenominator : null;

    // Usage Rate: possessions used per 40 minutes, pace-adjusted.
    const usagePct =
      playerFga != null &&
      playerFta != null &&
      playerAssists != null &&
      playerTurnovers != null &&
      playerMinutes &&
      leaguePace != null &&
      teamPace
        ? ((playerFga + 0.44 * playerFta + 0.33 * playerAssists + playerTurnovers) * 40 * leaguePace) / (playerMinutes * teamPace)
        : null;

    // Rebound Rate: (REB * Team Minutes) / (Player Minutes * (Team REB + Opponent REB)).
    const reboundPct =
      playerRebounds != null && teamMinutes != null && playerMinutes && teamRebounds != null && oppRebounds != null
        ? (100 * (playerRebounds * teamMinutes)) / (playerMinutes * (teamRebounds + oppRebounds))
        : null;

    rows.push({
      seasonId: stat.seasonId,
      seasonYear: stat.season.year,
      seasonType: stat.season.type,
      gamesPlayed: playerGamesPlayed,
      per40Points: per40(playerPoints),
      per40Rebounds: per40(playerRebounds),
      per40Assists: per40(playerAssists),
      trueShootingPct,
      assistPct,
      turnoverPct,
      usagePct,
      reboundPct,
    });
  }

  return NextResponse.json({ rows });
}
