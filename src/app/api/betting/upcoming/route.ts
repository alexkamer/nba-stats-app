import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Serves the betting-insights-page capability: upcoming games with our own
// pick (GameProjection), the market line (Odds — see betting-odds-ingest
// for how it now also covers scheduled games), ESPN's predictor snapshot
// (a reference only, never the system's recommendation), and player prop
// leans. All of these are nullable per game — sparse market/prop coverage
// is expected (see design.md "Sparse coverage" risk), so the page's own
// no-data handling, not this route, decides what to show.
export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const games = await prisma.game.findMany({
      where: { status: "SCHEDULED", date: { gte: startOfDay, lt: endOfDay } },
      orderBy: { date: "asc" },
      include: {
        homeTeam: { select: { id: true, abbreviation: true, name: true, logoUrl: true } },
        awayTeam: { select: { id: true, abbreviation: true, name: true, logoUrl: true } },
        gameProjection: true,
        odds: true,
        predictorSnapshot: true,
        playerPropProjections: {
          include: {
            player: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    const result = games.map((game) => ({
      espnId: game.espnId,
      date: game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      projection: game.gameProjection
        ? {
            projectedHomeScore: game.gameProjection.projectedHomeScore,
            projectedAwayScore: game.gameProjection.projectedAwayScore,
            projectedMargin: game.gameProjection.projectedMargin,
            spreadBettable: game.gameProjection.spreadBettable,
            totalBettable: game.gameProjection.totalBettable,
            marginStdev: game.gameProjection.marginStdev,
            totalStdev: game.gameProjection.totalStdev,
          }
        : null,
      market: game.odds
        ? {
            provider: game.odds.provider,
            spread: game.odds.spread,
            overUnder: game.odds.overUnder,
            homeMoneyline: game.odds.homeMoneyline,
            awayMoneyline: game.odds.awayMoneyline,
          }
        : null,
      predictor: game.predictorSnapshot
        ? { homeWinPct: game.predictorSnapshot.homeWinPct, awayWinPct: game.predictorSnapshot.awayWinPct }
        : null,
      playerProps: game.playerPropProjections
        .filter((p) => p.line != null)
        .map((p) => {
          const line = p.line!;
          return {
            playerId: p.player.id,
            playerName: p.player.displayName,
            statType: p.statType,
            projectedValue: p.projectedValue,
            line,
            lean: p.projectedValue > line ? "OVER" : p.projectedValue < line ? "UNDER" : "PUSH",
            bettable: p.bettable,
            stdev: p.stdev,
          };
        }),
    }));

    return NextResponse.json({ games: result });
  } catch (error) {
    console.error("GET /api/betting/upcoming failed:", error);
    return NextResponse.json({ error: "Failed to load upcoming betting insights" }, { status: 500 });
  }
}
