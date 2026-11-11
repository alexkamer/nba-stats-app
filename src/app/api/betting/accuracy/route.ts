import { prisma } from "@/lib/db";
import { getDailyBestBetSnapshot } from "@/lib/daily-best-bets";
import { getDailyBestBetCurrentSnapshot } from "@/lib/daily-best-bets-current";
import {
  computeAccuracy,
  computeAccuracyWithPnl,
  accuracyByMethod,
  accuracyByStatType,
  computeKingOfTheCourtAccuracy,
} from "@lib/accuracy/compute-accuracy";
import {
  gradeEspnPredictorSpread,
  gradeMarketFavorite,
} from "@lib/accuracy/grade-game";
import {
  BEST_BETS_PER_DAY,
  HIGH_CONFIDENCE_EDGE_RATIO,
  computeEdgeRatio,
} from "@lib/projections/confidence";
import { selectBestBets } from "@lib/betting/select-best-bets";
import { NextResponse } from "next/server";

/** Local (not UTC) YYYY-MM-DD for a game's date — approximate day bucket
 * used only to group props the same way the best-bets strip groups a
 * day's games; a game landing in the "wrong" day at a timezone boundary
 * wouldn't change which group it's ranked within meaningfully. */
function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Serves the prediction-accuracy-tracking capability's running accuracy
// record. Graded rows only come from games that have reached FINAL (see
// ingest/grade-predictions.ts) — early in a season, or right after this
// ships, this is expected to be thin or empty (design.md "Cold-start
// accuracy"), which `computeAccuracy` already represents as `hitRate: null`
// rather than an error.
export async function GET() {
  try {
    const [gameRows, predictorRows, propRows, kingOfTheCourtRows] = await Promise.all([
      prisma.gameProjection.findMany({
        where: { gradedAt: { not: null } },
        select: {
          method: true,
          gradedCorrect: true,
          gradedSpreadCorrect: true,
          gradedTotalCorrect: true,
          spreadBettable: true,
          totalBettable: true,
          // Frozen at pick time (see betting-odds-ingest) — enough to grade
          // "always pick the market favorite" live, alongside the game's
          // own already-final score, with no new storage (design.md
          // "Market-favorite accuracy baseline").
          marketMarginAtPick: true,
          // Frozen at pick time, same as above — needed to tell which side
          // (home/away) our straight-up and spread picks actually landed
          // on, so the right side's odds get settled for `unitsPnl` below.
          projectedMargin: true,
          game: {
            select: {
              homeScore: true,
              awayScore: true,
              odds: {
                select: {
                  homeMoneyline: true,
                  awayMoneyline: true,
                  homeSpreadOdds: true,
                  awaySpreadOdds: true,
                },
              },
            },
          },
        },
      }),
      prisma.predictorSnapshot.findMany({
        where: { gradedAt: { not: null } },
        select: {
          gradedCorrect: true,
          homeWinPct: true,
          awayWinPct: true,
          game: {
            select: {
              homeScore: true,
              awayScore: true,
              // The market's own spread, not our model's frozen
              // `marketMarginAtPick` — ESPN's predictor has no pick-time
              // framing to stay faithful to (it's just a win probability),
              // so there's no hindsight risk in reading the game's actual
              // closing line directly. `Odds` stops updating once a game
              // goes FINAL, so this is already the stable closing number,
              // not something that could still move.
              odds: {
                select: {
                  spread: true,
                  homeMoneyline: true,
                  awayMoneyline: true,
                  homeSpreadOdds: true,
                  awaySpreadOdds: true,
                },
              },
            },
          },
        },
      }),
      prisma.playerPropProjection.findMany({
        where: { gradedAt: { not: null } },
        select: {
          method: true,
          statType: true,
          playerId: true,
          gameId: true,
          gradedCorrect: true,
          // Line-independent actual stat total — unlike `gradedCorrect`
          // (graded against the frozen `line` below), this is what backs
          // the "Current" best-bets accuracy, since that selection's own
          // line/lean (from DailyBestBetCurrent) can differ from the
          // frozen one.
          gradedActualValue: true,
          bettable: true,
          projectedValue: true,
          line: true,
          stdev: true,
          game: {
            select: {
              date: true,
              // Per-side (OVER/UNDER) American odds — matched below by
              // player/stat/side to the side we actually leaned, same as
              // `/api/betting/upcoming` and the accuracy drill-down route.
              playerPropOdds: {
                select: {
                  playerId: true,
                  statType: true,
                  side: true,
                  odds: true,
                },
              },
            },
          },
        },
      }),
      prisma.kingOfTheCourtEntry.findMany({
        where: { gradedAt: { not: null } },
        select: { rank: true, gradedHit: true },
      }),
    ]);

    /** Moneyline for the side our straight-up pick actually favors. */
    function gamePickOdds(r: (typeof gameRows)[number]): number | null {
      const pickedHome = r.projectedMargin >= 0;
      return pickedHome
        ? (r.game.odds?.homeMoneyline ?? null)
        : (r.game.odds?.awayMoneyline ?? null);
    }

    /** Spread odds for the side our against-the-spread pick actually
     * favors — same `pickedHome` convention as the accuracy drill-down
     * route's own `spreadPicks`. */
    function spreadPickOdds(r: (typeof gameRows)[number]): number | null {
      if (r.marketMarginAtPick === null) return null;
      const pickedHome = r.projectedMargin > r.marketMarginAtPick;
      return pickedHome
        ? (r.game.odds?.homeSpreadOdds ?? null)
        : (r.game.odds?.awaySpreadOdds ?? null);
    }

    /** Moneyline for the side ESPN's predictor favors to win. */
    function espnPickOdds(r: (typeof predictorRows)[number]): number | null {
      const pickedHome = r.homeWinPct >= r.awayWinPct;
      return pickedHome
        ? (r.game.odds?.homeMoneyline ?? null)
        : (r.game.odds?.awayMoneyline ?? null);
    }

    /** Odds for the OVER/UNDER side a prop pick actually leaned, matched
     * the same way `toPropPick` in the accuracy drill-down route does. */
    function propPickOdds(r: {
      playerId: number;
      statType: string;
      line: number | null;
      projectedValue: number;
      game: {
        playerPropOdds: Array<{
          playerId: number;
          statType: string;
          side: string;
          odds: number | null;
        }>;
      };
    }): number | null {
      if (r.line === null) return null;
      const side = r.projectedValue > r.line ? "OVER" : "UNDER";
      const oddsRow = r.game.playerPropOdds.find(
        (o) =>
          o.playerId === r.playerId &&
          o.statType === r.statType &&
          o.side === side,
      );
      return oddsRow?.odds ?? null;
    }

    // Winner (straight-up) accuracy — a different bet than the spread/total
    // picks below, graded separately since picking the right winner and
    // picking the right side of the market line are not the same thing.
    const gameAccuracy = computeAccuracyWithPnl(
      gameRows.map((r) => ({ correct: r.gradedCorrect, odds: gamePickOdds(r) })),
    );
    const spreadAccuracy = computeAccuracyWithPnl(
      gameRows.map((r) => ({
        correct: r.gradedSpreadCorrect,
        odds: spreadPickOdds(r),
      })),
    );
    const bettableSpreadAccuracy = computeAccuracyWithPnl(
      gameRows
        .filter((r) => r.spreadBettable)
        .map((r) => ({
          correct: r.gradedSpreadCorrect,
          odds: spreadPickOdds(r),
        })),
    );
    const totalAccuracy = computeAccuracy(
      gameRows.map((r) => r.gradedTotalCorrect),
    );
    const bettableTotalAccuracy = computeAccuracy(
      gameRows.filter((r) => r.totalBettable).map((r) => r.gradedTotalCorrect),
    );

    const propAccuracy = computeAccuracyWithPnl(
      propRows.map((r) => ({ correct: r.gradedCorrect, odds: propPickOdds(r) })),
    );
    // The subset of props that cleared the confidence bar (see
    // lib/projections/confidence.ts) — a near-miss call on a low-edge prop
    // shouldn't drag down the number that actually represents our
    // recommendations.
    const bettablePropAccuracy = computeAccuracyWithPnl(
      propRows
        .filter((r) => r.bettable)
        .map((r) => ({ correct: r.gradedCorrect, odds: propPickOdds(r) })),
    );

    // DNP props never get a gradedCorrect (see ingest/grade-predictions.ts),
    // so "decided" here already excludes them — same subset the live best-
    // bets strip and "Recommended" filter mean by a prop actually counting.
    const decidedProps = propRows
      .filter((r) => r.gradedCorrect !== null)
      .map((r) => ({
        ...r,
        edgeRatio: computeEdgeRatio(r.projectedValue, r.line, r.stdev) ?? 0,
      }));

    // For any day that has a locked-in DailyBestBet snapshot (see
    // src/lib/daily-best-bets.ts — every day from this feature onward,
    // once its live picks were ever requested), grade exactly that frozen
    // selection instead of re-ranking today's final data. Only a day that
    // predates this table, or one nobody ever loaded live, falls back to
    // the old live-recompute-from-final-data selectBestBets call below.
    const decidedPropsByKey = new Map(
      decidedProps.map((r) => [`${r.gameId}|${r.playerId}|${r.statType}`, r]),
    );
    const bettableDecidedProps = decidedProps.filter((r) => r.bettable);
    const byDay = new Map<string, typeof bettableDecidedProps>();
    for (const row of bettableDecidedProps) {
      const key = dayKey(row.game.date);
      const group = byDay.get(key);
      if (group) group.push(row);
      else byDay.set(key, [row]);
    }
    const bestBetsRows: Array<{ correct: boolean | null; odds: number | null }> =
      [];
    for (const [day, dayProps] of byDay.entries()) {
      const snapshot = await getDailyBestBetSnapshot(day);
      if (snapshot) {
        for (const pick of snapshot) {
          const row = decidedPropsByKey.get(
            `${pick.gameId}|${pick.playerId}|${pick.statType}`,
          );
          if (row)
            bestBetsRows.push({
              correct: row.gradedCorrect,
              odds: propPickOdds(row),
            });
        }
      } else {
        for (const row of selectBestBets(dayProps, BEST_BETS_PER_DAY))
          bestBetsRows.push({
            correct: row.gradedCorrect,
            odds: propPickOdds(row),
          });
      }
    }
    const bestBetsAccuracy = computeAccuracyWithPnl(bestBetsRows);

    // "Current" best bets' track record — reads back DailyBestBetCurrent's
    // own captured line/lean/odds for each pick rather than
    // PlayerPropProjection.gradedCorrect, since that's graded against the
    // frozen line and a Current pick's line/lean can differ (see
    // DailyBestBetCurrent's schema comment). `actualValueByKey` has to
    // come from every graded prop row, not just `decidedProps` — a prop
    // that pushed against the frozen line (excluded from `decidedProps`)
    // can still have a decided actual value to grade a different Current
    // line against.
    const actualValueByKey = new Map(
      propRows
        .filter((r) => r.gradedActualValue !== null)
        .map((r) => [
          `${r.gameId}|${r.playerId}|${r.statType}`,
          r.gradedActualValue as number,
        ]),
    );
    const bestBetsCurrentRows: Array<{ correct: boolean | null; odds: number | null }> = [];
    for (const day of byDay.keys()) {
      const snapshot = await getDailyBestBetCurrentSnapshot(day);
      if (!snapshot) continue;
      for (const pick of snapshot) {
        const actualValue = actualValueByKey.get(
          `${pick.gameId}|${pick.playerId}|${pick.statType}`,
        );
        if (actualValue === undefined) continue;
        const correct =
          actualValue === pick.line
            ? null // push — excluded, same convention as every other bucket
            : pick.lean === "OVER"
              ? actualValue > pick.line
              : actualValue < pick.line;
        bestBetsCurrentRows.push({ correct, odds: pick.odds });
      }
    }
    const bestBetsCurrentAccuracy = computeAccuracyWithPnl(bestBetsCurrentRows);

    // Stricter than the bettable floor — picks whose edge was at least a
    // full standard deviation of the player's own recent variance.
    const highConfidenceAccuracy = computeAccuracyWithPnl(
      decidedProps
        .filter((r) => (r.edgeRatio ?? 0) >= HIGH_CONFIDENCE_EDGE_RATIO)
        .map((r) => ({ correct: r.gradedCorrect, odds: propPickOdds(r) })),
    );

    const overallAccuracy = computeAccuracyWithPnl([
      ...gameRows.map((r) => ({ correct: r.gradedCorrect, odds: gamePickOdds(r) })),
      ...propRows.map((r) => ({ correct: r.gradedCorrect, odds: propPickOdds(r) })),
    ]);
    const predictorAccuracy = computeAccuracyWithPnl(
      predictorRows.map((r) => ({ correct: r.gradedCorrect, odds: espnPickOdds(r) })),
    );

    // Third baseline, computed live from data already frozen/final — no
    // new grading pass or storage needed (design.md "Market-favorite
    // accuracy baseline"). Distinct from gameAccuracy: this grades the
    // market's own favorite, not our model's pick.
    // Own independent bucket, not pooled with game/prop accuracy (design.md
    // "Accuracy record is a new independent source") — a much harder bet
    // than any single prop, so its hit rate stands on its own.
    const kingOfTheCourtAccuracy = computeKingOfTheCourtAccuracy(kingOfTheCourtRows);

    const marketFavoriteAccuracy = computeAccuracy(
      gameRows
        .filter((r) => r.game.homeScore !== null && r.game.awayScore !== null)
        .map(
          (r) =>
            gradeMarketFavorite(
              r.marketMarginAtPick,
              r.game.homeScore!,
              r.game.awayScore!,
            ).correct,
        ),
    );

    // ESPN's predictor against the spread — ESPN only exposes a win
    // probability, not a projected margin (see ingest/mappers/predictor.ts),
    // so the side it favors to win stands in for a margin pick; whether
    // that side covered is graded the same way as our own spread picks
    // (gradeEspnPredictorSpread). Computed live, same as marketFavorite
    // below — no new storage needed.
    const espnSpreadAccuracy = computeAccuracyWithPnl(
      predictorRows
        .filter((r) => r.game.homeScore !== null && r.game.awayScore !== null)
        .map((r) => {
          const graded = gradeEspnPredictorSpread(
            r.homeWinPct,
            r.awayWinPct,
            r.game.odds?.spread != null ? -r.game.odds.spread : null,
            r.game.homeScore! - r.game.awayScore!,
          );
          const pickedHome = r.homeWinPct >= r.awayWinPct;
          const odds = pickedHome
            ? (r.game.odds?.homeSpreadOdds ?? null)
            : (r.game.odds?.awaySpreadOdds ?? null);
          return { correct: graded.correct, odds };
        }),
    );

    // Per-methodology-version breakdown — each table's `method` tag is
    // frozen at creation time and bumped independently of the other table
    // whenever that table's own methodology actually changes (see
    // ingest/generate-projections.ts), so grouping by it here is what
    // actually lets a new version be judged against its predecessor.
    const byMethod = {
      game: accuracyByMethod(gameRows, (r) => r.gradedCorrect),
      spread: accuracyByMethod(gameRows, (r) => r.gradedSpreadCorrect),
      total: accuracyByMethod(gameRows, (r) => r.gradedTotalCorrect),
      props: accuracyByMethod(propRows, (r) => r.gradedCorrect),
      bettableProps: accuracyByMethod(
        propRows.filter((r) => r.bettable),
        (r) => r.gradedCorrect,
      ),
    };

    // Retrospective breakdown for the betting-history-page capability
    // (prediction-accuracy-tracking's stat-type requirement) — only stat
    // types with at least one graded pick are included, rather than
    // showing a meaningless null-hit-rate entry for one with none yet.
    const propsByStatType = Object.fromEntries(
      Object.entries(
        accuracyByStatType(propRows, (r) => r.gradedCorrect),
      ).filter(([, summary]) => summary.graded > 0),
    );

    return NextResponse.json({
      ourModel: {
        game: gameAccuracy,
        spread: spreadAccuracy,
        bettableSpread: bettableSpreadAccuracy,
        total: totalAccuracy,
        bettableTotal: bettableTotalAccuracy,
        props: propAccuracy,
        bettableProps: bettablePropAccuracy,
        highConfidenceProps: highConfidenceAccuracy,
        bestBets: bestBetsAccuracy,
        bestBetsCurrent: bestBetsCurrentAccuracy,
        overall: overallAccuracy,
      },
      espnPredictor: predictorAccuracy,
      espnPredictorSpread: espnSpreadAccuracy,
      marketFavorite: marketFavoriteAccuracy,
      // `unitsPnl: null` added explicitly — King of the Court isn't an
      // odds-settled bet, so there's never a P/L figure, but the frontend's
      // shared AccuracyBucket shape expects the field to exist either way.
      kingOfTheCourt: { ...kingOfTheCourtAccuracy, unitsPnl: null },
      byMethod,
      propsByStatType,
    });
  } catch (error) {
    console.error("GET /api/betting/accuracy failed:", error);
    return NextResponse.json(
      { error: "Failed to load accuracy summary" },
      { status: 500 },
    );
  }
}
