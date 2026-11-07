import { prisma } from "@/lib/db";
import { computeAccuracy, accuracyByMethod, accuracyByStatType } from "@lib/accuracy/compute-accuracy";
import { gradeMarketFavorite } from "@lib/accuracy/grade-game";
import { BEST_BETS_PER_DAY, HIGH_CONFIDENCE_EDGE_RATIO, computeEdgeRatio } from "@lib/projections/confidence";
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
    const [gameRows, predictorRows, propRows] = await Promise.all([
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
          game: { select: { homeScore: true, awayScore: true } },
        },
      }),
      prisma.predictorSnapshot.findMany({ where: { gradedAt: { not: null } }, select: { gradedCorrect: true } }),
      prisma.playerPropProjection.findMany({
        where: { gradedAt: { not: null } },
        select: {
          method: true,
          statType: true,
          playerId: true,
          gradedCorrect: true,
          bettable: true,
          projectedValue: true,
          line: true,
          stdev: true,
          game: { select: { date: true } },
        },
      }),
    ]);

    // Winner (straight-up) accuracy — a different bet than the spread/total
    // picks below, graded separately since picking the right winner and
    // picking the right side of the market line are not the same thing.
    const gameAccuracy = computeAccuracy(gameRows.map((r) => r.gradedCorrect));
    const spreadAccuracy = computeAccuracy(gameRows.map((r) => r.gradedSpreadCorrect));
    const bettableSpreadAccuracy = computeAccuracy(
      gameRows.filter((r) => r.spreadBettable).map((r) => r.gradedSpreadCorrect),
    );
    const totalAccuracy = computeAccuracy(gameRows.map((r) => r.gradedTotalCorrect));
    const bettableTotalAccuracy = computeAccuracy(
      gameRows.filter((r) => r.totalBettable).map((r) => r.gradedTotalCorrect),
    );

    const propAccuracy = computeAccuracy(propRows.map((r) => r.gradedCorrect));
    // The subset of props that cleared the confidence bar (see
    // lib/projections/confidence.ts) — a near-miss call on a low-edge prop
    // shouldn't drag down the number that actually represents our
    // recommendations.
    const bettablePropAccuracy = computeAccuracy(propRows.filter((r) => r.bettable).map((r) => r.gradedCorrect));

    // DNP props never get a gradedCorrect (see ingest/grade-predictions.ts),
    // so "decided" here already excludes them — same subset the live best-
    // bets strip and "Recommended" filter mean by a prop actually counting.
    const decidedProps = propRows
      .filter((r) => r.gradedCorrect !== null)
      .map((r) => ({ ...r, edgeRatio: computeEdgeRatio(r.projectedValue, r.line, r.stdev) ?? 0 }));

    // Uses the same selectBestBets selection as the live BestBetsStrip
    // (src/app/betting/page.tsx): per day, the bettable props ranked by
    // edge ratio and deduplicated to one pick per player, top
    // BEST_BETS_PER_DAY — pooled across every day that's been graded,
    // rather than just the single day currently on screen.
    const byDay = new Map<string, typeof decidedProps>();
    for (const row of decidedProps.filter((r) => r.bettable)) {
      const key = dayKey(row.game.date);
      const group = byDay.get(key);
      if (group) group.push(row);
      else byDay.set(key, [row]);
    }
    const bestBetsGradedValues: Array<boolean | null> = [];
    for (const dayProps of byDay.values()) {
      for (const row of selectBestBets(dayProps, BEST_BETS_PER_DAY)) bestBetsGradedValues.push(row.gradedCorrect);
    }
    const bestBetsAccuracy = computeAccuracy(bestBetsGradedValues);

    // Stricter than the bettable floor — picks whose edge was at least a
    // full standard deviation of the player's own recent variance.
    const highConfidenceAccuracy = computeAccuracy(
      decidedProps.filter((r) => (r.edgeRatio ?? 0) >= HIGH_CONFIDENCE_EDGE_RATIO).map((r) => r.gradedCorrect),
    );

    const overallAccuracy = computeAccuracy([...gameRows, ...propRows].map((r) => r.gradedCorrect));
    const predictorAccuracy = computeAccuracy(predictorRows.map((r) => r.gradedCorrect));

    // Third baseline, computed live from data already frozen/final — no
    // new grading pass or storage needed (design.md "Market-favorite
    // accuracy baseline"). Distinct from gameAccuracy: this grades the
    // market's own favorite, not our model's pick.
    const marketFavoriteAccuracy = computeAccuracy(
      gameRows
        .filter((r) => r.game.homeScore !== null && r.game.awayScore !== null)
        .map((r) => gradeMarketFavorite(r.marketMarginAtPick, r.game.homeScore!, r.game.awayScore!).correct),
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
      bettableProps: accuracyByMethod(propRows.filter((r) => r.bettable), (r) => r.gradedCorrect),
    };

    // Retrospective breakdown for the betting-history-page capability
    // (prediction-accuracy-tracking's stat-type requirement) — only stat
    // types with at least one graded pick are included, rather than
    // showing a meaningless null-hit-rate entry for one with none yet.
    const propsByStatType = Object.fromEntries(
      Object.entries(accuracyByStatType(propRows, (r) => r.gradedCorrect)).filter(([, summary]) => summary.graded > 0),
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
        overall: overallAccuracy,
      },
      espnPredictor: predictorAccuracy,
      marketFavorite: marketFavoriteAccuracy,
      byMethod,
      propsByStatType,
    });
  } catch (error) {
    console.error("GET /api/betting/accuracy failed:", error);
    return NextResponse.json({ error: "Failed to load accuracy summary" }, { status: 500 });
  }
}
