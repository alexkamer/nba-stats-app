/**
 * Betting insights — accuracy grading (see
 * openspec/changes/add-betting-insights-page). For games that have become
 * FINAL, grades any ungraded `GameProjection`, `PredictorSnapshot`, and
 * `PlayerPropProjection` rows against the actual result and persists the
 * graded columns. Leaves projections for non-final games untouched.
 *
 * Intended to run after sync-completed-games.ts (so game status/scores are
 * current) and sync-aggregates.ts (so final box scores are ingested).
 *
 * Run with: npx tsx ingest/grade-predictions.ts
 */
import { prisma } from "./lib/db";
import { gradeGameProjection, gradePredictorSnapshot } from "../lib/accuracy/grade-game";
import { gradePlayerProp } from "../lib/accuracy/grade-prop";
import { extractStatValue } from "../lib/projections/extract-prop-stat";
import type { PropStatType } from "../lib/espn/prop-types";

async function gradeGameProjections() {
  const rows = await prisma.gameProjection.findMany({
    where: { gradedAt: null, game: { status: "FINAL" } },
    select: { id: true, projectedMargin: true, game: { select: { homeScore: true, awayScore: true } } },
  });

  let graded = 0;
  for (const row of rows) {
    if (row.game.homeScore === null || row.game.awayScore === null) continue;
    const result = gradeGameProjection(row.projectedMargin, row.game.homeScore, row.game.awayScore);
    await prisma.gameProjection.update({
      where: { id: row.id },
      data: { gradedCorrect: result.correct, gradedMarginError: result.marginError, gradedAt: new Date() },
    });
    graded += 1;
  }
  return { checked: rows.length, graded };
}

async function gradePredictorSnapshots() {
  const rows = await prisma.predictorSnapshot.findMany({
    where: { gradedAt: null, game: { status: "FINAL" } },
    select: {
      id: true,
      homeWinPct: true,
      awayWinPct: true,
      game: { select: { homeScore: true, awayScore: true } },
    },
  });

  let graded = 0;
  for (const row of rows) {
    if (row.game.homeScore === null || row.game.awayScore === null) continue;
    const result = gradePredictorSnapshot(row.homeWinPct, row.awayWinPct, row.game.homeScore, row.game.awayScore);
    await prisma.predictorSnapshot.update({
      where: { id: row.id },
      data: { gradedCorrect: result.correct, gradedMarginError: result.marginError, gradedAt: new Date() },
    });
    graded += 1;
  }
  return { checked: rows.length, graded };
}

async function gradePlayerPropProjections() {
  const rows = await prisma.playerPropProjection.findMany({
    where: { gradedAt: null, game: { status: "FINAL" } },
    select: {
      id: true,
      gameId: true,
      playerId: true,
      statType: true,
      projectedValue: true,
      propOdds: { select: { line: true } },
    },
  });

  let graded = 0;
  for (const row of rows) {
    const line = row.propOdds?.line;
    if (line === null || line === undefined) continue; // no line to grade against

    const gameStat = await prisma.playerGameStat.findUnique({
      where: { gameId_playerId: { gameId: row.gameId, playerId: row.playerId } },
      select: { points: true, rebounds: true, assists: true, threeMade: true, steals: true, blocks: true },
    });
    if (!gameStat || gameStat.points === null) continue; // player didn't play / no box score yet

    const actualValue = extractStatValue(row.statType as PropStatType, { ...gameStat, minutes: null });
    const result = gradePlayerProp(row.projectedValue, line, actualValue);
    await prisma.playerPropProjection.update({
      where: { id: row.id },
      data: { gradedCorrect: result.correct, gradedActualValue: actualValue, gradedAt: new Date() },
    });
    graded += 1;
  }
  return { checked: rows.length, graded };
}

async function main() {
  const start = Date.now();
  const games = await gradeGameProjections();
  const predictors = await gradePredictorSnapshots();
  const props = await gradePlayerPropProjections();
  console.log(
    `grade-predictions done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `games ${games.graded}/${games.checked}, predictor ${predictors.graded}/${predictors.checked}, ` +
      `props ${props.graded}/${props.checked} graded.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
