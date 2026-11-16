/**
 * Reusable hyperparameter sweep for lib/projections/game-projection.ts's
 * hand-picked constants, against real historical outcomes (same walk-
 * forward, no-lookahead replay as scripts/backtest-game-rating-floor.ts,
 * via lib/projections/backtest-game-methodology.ts's
 * `runGameHyperparameterSweep`). Mirrors
 * scripts/sweep-projection-hyperparameters.ts's shape for player props.
 *
 * Does not sweep REDISTRIBUTION_LOSS_FACTOR (the unavailable-scorer
 * adjustment) — no historical PlayerAvailability snapshot exists to
 * replay, same limitation as the rest of this backtest module.
 *
 * Read-only: queries Game only, never writes anything.
 *
 * Run with:
 *   npx tsx scripts/sweep-game-hyperparameters.ts --param=recentFormWeight --values=0.3,0.4,0.5,0.6,0.7,0.8
 *   npx tsx scripts/sweep-game-hyperparameters.ts --param=homeCourtEdge --values=dynamic,0,1,1.5,2,2.5,3,3.5
 */
import { prisma } from "../ingest/lib/db";
import {
  runGameHyperparameterSweep,
  type GameOutcomeRow,
  type GameBacktestResult,
} from "../lib/projections/backtest-game-methodology";
import { createErrorAccumulator, addError, meanAbsoluteError, meanSignedError } from "../lib/projections/backtest-methodology";

const DEFAULT_SEASONS = 4;
const DEFAULT_RECENT_FORM_WEIGHT = 0.6;
const DEFAULT_HOME_COURT_EDGE: "dynamic" | number = "dynamic";

type SweepableParam = "recentFormWeight" | "homeCourtEdge";

function parseArgs(argv: string[]): { param: SweepableParam; values: (number | "dynamic")[]; seasons: number } {
  let param: SweepableParam | null = null;
  let values: (number | "dynamic")[] = [];
  let seasons = DEFAULT_SEASONS;
  for (const arg of argv) {
    const paramMatch = arg.match(/^--param=(.+)$/);
    const valuesMatch = arg.match(/^--values=(.+)$/);
    const seasonsMatch = arg.match(/^--seasons=(\d+)$/);
    if (paramMatch) {
      if (paramMatch[1] !== "recentFormWeight" && paramMatch[1] !== "homeCourtEdge") {
        throw new Error(`Unknown --param: ${paramMatch[1]} (expected recentFormWeight or homeCourtEdge)`);
      }
      param = paramMatch[1];
    } else if (valuesMatch) {
      values = valuesMatch[1].split(",").map((v) => (v === "dynamic" ? "dynamic" : Number(v)));
    } else if (seasonsMatch) {
      seasons = Number(seasonsMatch[1]);
    }
  }
  if (!param || values.length === 0) {
    throw new Error("Usage: --param=recentFormWeight|homeCourtEdge --values=v1,v2,... [--seasons=N]");
  }
  return { param, values, seasons };
}

async function selectCompletedRegularSeasons(count: number): Promise<{ id: number; year: number }[]> {
  const regularSeasons = await prisma.season.findMany({
    where: { type: "REGULAR" },
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });
  const completed: { id: number; year: number }[] = [];
  for (const season of regularSeasons) {
    if (completed.length >= count) break;
    const incompleteGames = await prisma.game.count({ where: { seasonId: season.id, status: { not: "FINAL" } } });
    if (incompleteGames === 0) completed.push(season);
  }
  return completed;
}

function summarize(results: GameBacktestResult[]) {
  const marginAcc = createErrorAccumulator();
  const totalAcc = createErrorAccumulator();
  let winnerCorrect = 0;
  let winnerGraded = 0;
  for (const r of results) {
    addError(marginAcc, r.marginError, 0);
    addError(totalAcc, r.totalError, 0);
    if (r.correctWinner !== null) {
      winnerGraded += 1;
      if (r.correctWinner) winnerCorrect += 1;
    }
  }
  return {
    n: results.length,
    marginMae: meanAbsoluteError(marginAcc),
    marginBias: meanSignedError(marginAcc),
    totalMae: meanAbsoluteError(totalAcc),
    winnerAccuracy: winnerGraded > 0 ? winnerCorrect / winnerGraded : null,
  };
}

async function main() {
  const { param, values, seasons: seasonCount } = parseArgs(process.argv.slice(2));

  const seasons = await selectCompletedRegularSeasons(seasonCount);
  if (seasons.length === 0) {
    console.error("No completed regular seasons found to backtest.");
    process.exitCode = 1;
    return;
  }
  const scoredSeasonIds = new Set(seasons.map((s) => s.id));
  console.log(
    `Sweeping "${param}" over [${values.join(", ")}] across ${seasons.length} completed regular season(s): ${seasons.map((s) => s.year).join(", ")}`,
  );

  const rows = await prisma.game.findMany({
    where: { status: "FINAL" },
    select: { id: true, date: true, seasonId: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    orderBy: { date: "asc" },
  });
  const allGames: GameOutcomeRow[] = rows
    .filter((g) => g.homeScore !== null && g.awayScore !== null)
    .map((g) => ({
      gameId: g.id,
      date: g.date,
      seasonId: g.seasonId,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore!,
      awayScore: g.awayScore!,
    }));
  console.log(`Loaded ${allGames.length} FINAL games of league history.`);

  const rowsOut = [];
  for (const value of values) {
    const recentFormWeight = param === "recentFormWeight" ? (value as number) : DEFAULT_RECENT_FORM_WEIGHT;
    const homeCourtEdge = param === "homeCourtEdge" ? value : DEFAULT_HOME_COURT_EDGE;
    console.log(`\nRunning candidate ${param}=${value}...`);
    const results = runGameHyperparameterSweep(allGames, scoredSeasonIds, { recentFormWeight, homeCourtEdge });
    rowsOut.push({ value, ...summarize(results) });
  }

  console.log("\nMargin/total error by candidate (lower MAE better; winner accuracy higher better):");
  console.table(
    rowsOut.map((r) => ({
      [param]: r.value,
      n: r.n,
      marginMae: r.marginMae?.toFixed(3) ?? "n/a",
      marginBias: r.marginBias?.toFixed(3) ?? "n/a",
      totalMae: r.totalMae?.toFixed(3) ?? "n/a",
      winnerAccuracy: r.winnerAccuracy !== null ? (r.winnerAccuracy * 100).toFixed(1) + "%" : "n/a",
    })),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
