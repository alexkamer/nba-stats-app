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
      prisma.gameProjection.findMany({ where: { gradedAt: { not: null } }, select: { gradedCorrect: true } }),
      prisma.predictorSnapshot.findMany({ where: { gradedAt: { not: null } }, select: { gradedCorrect: true } }),
      prisma.playerPropProjection.findMany({ where: { gradedAt: { not: null } }, select: { gradedCorrect: true } }),
    ]);

    const gameAccuracy = computeAccuracy(gameRows.map((r) => r.gradedCorrect));
    const propAccuracy = computeAccuracy(propRows.map((r) => r.gradedCorrect));
    const overallAccuracy = computeAccuracy([...gameRows, ...propRows].map((r) => r.gradedCorrect));
    const predictorAccuracy = computeAccuracy(predictorRows.map((r) => r.gradedCorrect));

    return NextResponse.json({
      ourModel: { game: gameAccuracy, props: propAccuracy, overall: overallAccuracy },
      espnPredictor: predictorAccuracy,
    });
  } catch (error) {
    console.error("GET /api/betting/accuracy failed:", error);
    return NextResponse.json({ error: "Failed to load accuracy summary" }, { status: 500 });
  }
}
