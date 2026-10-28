import { prisma } from "@/lib/db";
import { getGameHeaderExtras, getLiveGameDetail, getWinProbability } from "@/lib/espn-live";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

// Branches per SPEC.md Sec 4: `final` games are served from the DB
// (ingested by the sync jobs); anything else (scheduled/in-progress, or
// simply not ingested yet) falls back to the live ESPN proxy, which is
// never persisted.
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  try {
    const game = await prisma.game.findUnique({
      where: { espnId: eventId },
      include: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        season: true,
        teamGameStats: { include: { team: true } },
        playerGameStats: { include: { player: true, team: true } },
        plays: { orderBy: { sequenceNumber: "asc" } },
        odds: true,
      },
    });

    if (game) {
      // Team espnIds are stable across relocation/rename (e.g. Seattle
      // SuperSonics -> OKC Thunder) — show the era-accurate name/logo for
      // this game's season year rather than always the current branding.
      const [identities, headerExtras, winProbability] = await Promise.all([
        resolveTeamIdentities([game.homeTeamId, game.awayTeamId], game.season.year),
        getGameHeaderExtras(eventId),
        getWinProbability(eventId),
      ]);
      const homeIdentity = identities.get(game.homeTeamId);
      const awayIdentity = identities.get(game.awayTeamId);
      const gameWithIdentity = {
        ...game,
        homeTeam: homeIdentity ? { ...game.homeTeam, ...homeIdentity } : game.homeTeam,
        awayTeam: awayIdentity ? { ...game.awayTeam, ...awayIdentity } : game.awayTeam,
        teamGameStats: game.teamGameStats.map((s) => {
          const identity = identities.get(s.teamId);
          return identity ? { ...s, team: { ...s.team, ...identity } } : s;
        }),
        // Period scores / records are never persisted (SPEC.md Sec 6 has no
        // linescore/record columns) — pulled live from ESPN regardless of
        // whether the rest of the page is DB-sourced.
        headerExtras,
        winProbability,
      };
      return NextResponse.json({ game: gameWithIdentity, source: "db" });
    }

    const liveGame = await getLiveGameDetail(eventId);
    if (!liveGame) {
      return NextResponse.json({ error: "Game not found (unknown espnId)" }, { status: 404 });
    }
    return NextResponse.json({ game: liveGame, source: "live" });
  } catch {
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
