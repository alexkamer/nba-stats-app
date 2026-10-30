import { prisma } from "@/lib/db";
import { computeAccuracy } from "@lib/accuracy/compute-accuracy";
import { NextResponse } from "next/server";

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
          gradedCorrect: true,
          gradedSpreadCorrect: true,
          gradedTotalCorrect: true,
          spreadBettable: true,
          totalBettable: true,
        },
      }),
      prisma.predictorSnapshot.findMany({ where: { gradedAt: { not: null } }, select: { gradedCorrect: true } }),
      prisma.playerPropProjection.findMany({
        where: { gradedAt: { not: null } },
        select: { gradedCorrect: true, bettable: true },
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
    const overallAccuracy = computeAccuracy([...gameRows, ...propRows].map((r) => r.gradedCorrect));
    const predictorAccuracy = computeAccuracy(predictorRows.map((r) => r.gradedCorrect));

    return NextResponse.json({
      ourModel: {
        game: gameAccuracy,
        spread: spreadAccuracy,
        bettableSpread: bettableSpreadAccuracy,
        total: totalAccuracy,
        bettableTotal: bettableTotalAccuracy,
        props: propAccuracy,
        bettableProps: bettablePropAccuracy,
        overall: overallAccuracy,
      },
      espnPredictor: predictorAccuracy,
    });
  } catch (error) {
    console.error("GET /api/betting/accuracy failed:", error);
    return NextResponse.json({ error: "Failed to load accuracy summary" }, { status: 500 });
  }
}
