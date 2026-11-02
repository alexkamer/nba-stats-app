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
import {
  gradeGameProjection,
  gradePredictorSnapshot,
  gradeSpreadCoverage,
  gradeTotalCoverage,
} from "../lib/accuracy/grade-game";
import { gradePlayerProp } from "../lib/accuracy/grade-prop";
import { extractStatValue } from "../lib/projections/extract-prop-stat";
import type { PropStatType } from "../lib/espn/prop-types";

async function gradeGameProjections() {
  const rows = await prisma.gameProjection.findMany({
    where: { gradedAt: null, game: { status: "FINAL" } },
    select: {
      id: true,
      projectedMargin: true,
      projectedHomeScore: true,
      projectedAwayScore: true,
      marketMarginAtPick: true,
      marketTotalAtPick: true,
      game: { select: { homeScore: true, awayScore: true } },
    },
  });

  let graded = 0;
  for (const row of rows) {
    if (row.game.homeScore === null || row.game.awayScore === null) continue;
    const result = gradeGameProjection(row.projectedMargin, row.game.homeScore, row.game.awayScore);
    const actualMargin = row.game.homeScore - row.game.awayScore;
    const actualTotal = row.game.homeScore + row.game.awayScore;
    const spreadResult = gradeSpreadCoverage(row.projectedMargin, row.marketMarginAtPick, actualMargin);
    const totalResult = gradeTotalCoverage(
      row.projectedHomeScore + row.projectedAwayScore,
      row.marketTotalAtPick,
      actualTotal,
    );
    await prisma.gameProjection.update({
      where: { id: row.id },
      data: {
        gradedCorrect: result.correct,
        gradedMarginError: result.marginError,
        gradedSpreadCorrect: spreadResult.correct,
        gradedTotalCorrect: totalResult.correct,
        gradedAt: new Date(),
      },
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
      line: true,
    },
  });

  let graded = 0;
  for (const row of rows) {
    const line = row.line;
    if (line === null) continue; // no line to grade against

    const gameStat = await prisma.playerGameStat.findUnique({
      where: { gameId_playerId: { gameId: row.gameId, playerId: row.playerId } },
      select: { points: true, rebounds: true, assists: true, threeMade: true, steals: true, blocks: true },
    });
    if (!gameStat || gameStat.points === null) {
      // Player never suited up (injury scratch, DNP-CD, etc.) — there's no
      // box score to grade against, and never will be for this game. Mark
      // it graded-with-no-verdict now rather than leaving gradedAt null,
      // which would otherwise make this row look like grading just hasn't
      // run yet (and re-query it on every future run) instead of a prop
      // that can never resolve.
      await prisma.playerPropProjection.update({
        where: { id: row.id },
        data: { gradedAt: new Date() },
      });
      continue;
    }

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
