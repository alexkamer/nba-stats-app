import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getGameSummaryExtras, getLiveGameDetail } from "@/lib/espn-live";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { NextResponse } from "next/server";

// Branches per SPEC.md Sec 4: `final` games are served from the DB
// (ingested by the sync jobs); anything else (scheduled/in-progress, or
// simply not ingested yet) falls back to the live ESPN proxy, which is
// never persisted. In espn-only mode, always take the live branch.
//
// A DB row can exist but still be stale — it was created when the game was
// merely scheduled, and the sync job only backfills box score/plays/odds
// once the game goes final — so a non-final row has those relations sitting
// empty even while the game is actually live right now. Rather than render
// that emptiness as "no data", such a row is treated the same as "not
// ingested yet" and served from the live proxy instead (SPEC.md Sec 4).
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  try {
    const game = isEspnOnly()
      ? null
      : await prisma.game.findUnique({
          where: { espnId: eventId, status: "FINAL" },
          include: {
            homeTeam: true,
            awayTeam: true,
            venue: true,
            season: true,
            teamGameStats: { include: { team: true } },
            playerGameStats: { include: { player: { include: { position: true } }, team: true } },
            plays: { orderBy: { sequenceNumber: "asc" } },
            odds: true,
          },
        });

    if (game) {
      // Team espnIds are stable across relocation/rename (e.g. Seattle
      // SuperSonics -> OKC Thunder) — show the era-accurate name/logo for
      // this game's season year rather than always the current branding.
      const [identities, { headerExtras, winProbability, shots, recap, teamStatsBreakdown }] = await Promise.all([
        resolveTeamIdentities([game.homeTeamId, game.awayTeamId], game.season.year),
        getGameSummaryExtras(eventId),
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
        shots,
        recap,
        teamStatsBreakdown,
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
