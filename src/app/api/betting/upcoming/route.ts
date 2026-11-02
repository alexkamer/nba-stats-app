import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Serves the betting-insights-page capability: a day's games with our own
// pick (GameProjection), the market line (Odds — see betting-odds-ingest
// for how it now also covers scheduled games), ESPN's predictor snapshot
// (a reference only, never the system's recommendation), and player prop
// leans. Defaults to today; an optional `date` (YYYY-MM-DD) query param
// looks at any other day, in which case games that have gone FINAL also
// carry their graded result (actual score/value, hit or miss) alongside
// the original pick — grading is frozen at pick time (see
// prediction-accuracy-tracking), so this never reflects hindsight. All
// projection/market/predictor fields stay nullable per game — sparse
// coverage is expected (design.md "Sparse coverage" risk), so the page's
// own no-data handling, not this route, decides what to show.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");

    let startOfDay: Date;
    if (dateParam) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
      if (!match) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      const [, year, month, day] = match;
      startOfDay = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const games = await prisma.game.findMany({
      where: { date: { gte: startOfDay, lt: endOfDay } },
      orderBy: { date: "asc" },
      include: {
        homeTeam: { select: { id: true, espnId: true, abbreviation: true, name: true, logoUrl: true } },
        awayTeam: { select: { id: true, espnId: true, abbreviation: true, name: true, logoUrl: true } },
        gameProjection: true,
        odds: true,
        predictorSnapshot: true,
        playerPropProjections: {
          include: {
            player: { select: { id: true, espnId: true, displayName: true } },
          },
        },
        // Frozen, refreshed-up-to-tip-off availability snapshot (see
        // player-availability-tracking capability) — the source of truth
        // for `ruledOut` below, instead of a live ESPN fetch at request time.
        playerAvailabilities: { select: { playerId: true, status: true } },
        // Odds are per-side (OVER/UNDER each get their own American odds,
        // e.g. -121/-105) — PlayerPropProjection only links to one side via
        // propOddsId, so the side matching our actual lean has to be looked
        // up separately rather than assumed to be the linked one.
        playerPropOdds: { select: { playerId: true, statType: true, side: true, odds: true } },
      },
    });

    const result = games.map((game) => {
      // Frozen availability is only meaningful for games that haven't been
      // played yet — for a FINAL game, the box score (gradedAt/gradedActualValue
      // below) is the ground truth on who actually suited up.
      const outPlayerIds =
        game.status !== "FINAL"
          ? new Set(game.playerAvailabilities.filter((a) => a.status === "OUT").map((a) => a.playerId))
          : null;
      return {
        espnId: game.espnId,
        date: game.date,
        status: game.status,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        projection: game.gameProjection
          ? {
              projectedHomeScore: game.gameProjection.projectedHomeScore,
              projectedAwayScore: game.gameProjection.projectedAwayScore,
              projectedMargin: game.gameProjection.projectedMargin,
              spreadBettable: game.gameProjection.spreadBettable,
              totalBettable: game.gameProjection.totalBettable,
              marginStdev: game.gameProjection.marginStdev,
              totalStdev: game.gameProjection.totalStdev,
              gradedCorrect: game.gameProjection.gradedCorrect,
              gradedSpreadCorrect: game.gameProjection.gradedSpreadCorrect,
              gradedTotalCorrect: game.gameProjection.gradedTotalCorrect,
            }
          : null,
        market: game.odds
          ? {
              provider: game.odds.provider,
              spread: game.odds.spread,
              overUnder: game.odds.overUnder,
              homeMoneyline: game.odds.homeMoneyline,
              awayMoneyline: game.odds.awayMoneyline,
              homeSpreadOdds: game.odds.homeSpreadOdds,
              awaySpreadOdds: game.odds.awaySpreadOdds,
              overOdds: game.odds.overOdds,
              underOdds: game.odds.underOdds,
            }
          : null,
        predictor: game.predictorSnapshot
          ? { homeWinPct: game.predictorSnapshot.homeWinPct, awayWinPct: game.predictorSnapshot.awayWinPct }
          : null,
        playerProps: game.playerPropProjections
          .filter((p) => p.line != null)
          .map((p) => {
            const line = p.line!;
            const lean = p.projectedValue > line ? "OVER" : p.projectedValue < line ? "UNDER" : "PUSH";
            const oddsRow = game.playerPropOdds.find(
              (o) => o.playerId === p.playerId && o.statType === p.statType && o.side === lean,
            );
            return {
              playerId: p.player.id,
              playerName: p.player.displayName,
              statType: p.statType,
              projectedValue: p.projectedValue,
              line,
              lean,
              odds: oddsRow?.odds ?? null,
              bettable: p.bettable,
              stdev: p.stdev,
              gradedCorrect: p.gradedCorrect,
              gradedActualValue: p.gradedActualValue,
              // Game went FINAL and grading ran, but there was no box score
              // to grade against — the player never suited up.
              dnp: game.status === "FINAL" && p.gradedAt !== null && p.gradedCorrect === null,
              ruledOut: outPlayerIds !== null && outPlayerIds.has(p.player.id),
            };
          }),
      };
    });

    return NextResponse.json({ games: result });
  } catch (error) {
    console.error("GET /api/betting/upcoming failed:", error);
    return NextResponse.json({ error: "Failed to load upcoming betting insights" }, { status: 500 });
  }
}
