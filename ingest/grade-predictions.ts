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
import { gradeKingOfTheCourt } from "../lib/accuracy/grade-king-of-the-court";
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

// Grades a King of the Court leaderboard once its calendar date's actual
// leader is known (DailyStatLeader has a row for that date, itself only
// written once every game on that date is FINAL — see
// ingest/compute-daily-stat-leaders.ts). A date with pending games simply
// has no DailyStatLeader row yet, so its leaderboard is skipped and
// retried on a later run. "Hit" is whether any rank-1 (tied or outright)
// candidate matches any of the date's recorded leaders (ties kept, same
// as DailyStatLeader itself — see lib/accuracy/grade-king-of-the-court.ts).
// Every entry on a graded leaderboard gets `gradedAt` set so the
// leaderboard isn't re-queried on future runs; only rank-1 entries get a
// meaningful `gradedHit` (the others were never the prediction).
async function gradeKingOfTheCourtLeaderboards() {
  const leaderboards = await prisma.kingOfTheCourtLeaderboard.findMany({
    where: { entries: { some: { gradedAt: null } } },
    select: { id: true, date: true, entries: { select: { id: true, playerId: true, rank: true } } },
  });

  let graded = 0;
  for (const leaderboard of leaderboards) {
    const dailyLeader = await prisma.dailyStatLeader.findUnique({
      where: { date: leaderboard.date },
      select: { entries: { select: { playerId: true } } },
    });
    if (!dailyLeader) continue; // this date's games haven't all gone FINAL yet

    const actualLeaderPlayerIds = dailyLeader.entries.map((e) => e.playerId);
    const topRankedPlayerIds = leaderboard.entries.filter((e) => e.rank === 1).map((e) => e.playerId);
    const hit = gradeKingOfTheCourt(topRankedPlayerIds, actualLeaderPlayerIds);

    await Promise.all(
      leaderboard.entries.map((entry) =>
        prisma.kingOfTheCourtEntry.update({
          where: { id: entry.id },
          data: { gradedAt: new Date(), gradedHit: entry.rank === 1 ? hit : null },
        }),
      ),
    );
    graded += 1;
  }
  return { checked: leaderboards.length, graded };
}

async function main() {
  const start = Date.now();
  const games = await gradeGameProjections();
  const predictors = await gradePredictorSnapshots();
  const props = await gradePlayerPropProjections();
  const kingOfTheCourt = await gradeKingOfTheCourtLeaderboards();
  console.log(
    `grade-predictions done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `games ${games.graded}/${games.checked}, predictor ${predictors.graded}/${predictors.checked}, ` +
      `props ${props.graded}/${props.checked}, King of the Court ${kingOfTheCourt.graded}/${kingOfTheCourt.checked} graded.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
