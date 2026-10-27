import { prisma } from "@/lib/db";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

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
        playerSeasonStats: { orderBy: { season: { year: "desc" } }, include: { season: true } },
      },
    });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
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

    return NextResponse.json({ player, recentGames: recentGamesWithIdentity });
  } catch {
    return NextResponse.json({ error: "Failed to load player" }, { status: 500 });
  }
}
