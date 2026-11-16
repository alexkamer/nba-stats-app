/**
 * Validates the "per-team season-rating floor" hypothesis before it
 * touches production code. Live `generate-projections.ts` only gates the
 * opponent-rating solve on a *league-wide* game-count floor
 * (`MIN_LEAGUE_GAMES_FOR_RATING = 20` in team-rating.ts) — that clears
 * almost immediately each season (30 teams x a handful of games each), so
 * a team with as few as its own first 2-3 games of the season still gets
 * its raw, unshrunk opponent-adjusted season rating fed straight into
 * `projectGame`, with no per-team sample-size check at all. An audit of
 * live graded `v2-opponent-rating` projections found exactly this: 16/113
 * graded games had a projected margin >15pts away from the market line,
 * every one of them clustered in the season's first ~10 team-games, and
 * the model's own "bettable" spread picks were graded *below* a coin flip
 * (12/27) as a result.
 *
 * This script walks forward through the last N completed regular seasons
 * day by day (lib/projections/backtest-game-methodology.ts) and compares
 * candidate `minSeasonGamesForRating` floors — including 0, today's
 * production behavior — against real final scores. No market odds
 * involved and no lookahead: a game is only ever projected from games
 * strictly before its own calendar day.
 *
 * Read-only: queries Game only, never writes anything.
 *
 * Run with:
 *   npx tsx scripts/backtest-game-rating-floor.ts --values=0,3,5,8,10,15 [--seasons=4] [--out=path.json]
 */
import { prisma } from "../ingest/lib/db";
import {
  runGameRatingFloorBacktest,
  type GameOutcomeRow,
  type GameBacktestResult,
} from "../lib/projections/backtest-game-methodology";
import { createErrorAccumulator, addError, meanAbsoluteError, meanSignedError, type ErrorAccumulator } from "../lib/projections/backtest-methodology";
import { writeFileSync } from "fs";

const DEFAULT_SEASONS = 4;

function parseArgs(argv: string[]): { values: number[]; seasons: number; out: string | null } {
  let values: number[] = [];
  let seasons = DEFAULT_SEASONS;
  let out: string | null = null;
  for (const arg of argv) {
    const valuesMatch = arg.match(/^--values=(.+)$/);
    const seasonsMatch = arg.match(/^--seasons=(\d+)$/);
    const outMatch = arg.match(/^--out=(.+)$/);
    if (valuesMatch) values = valuesMatch[1].split(",").map(Number);
    else if (seasonsMatch) seasons = Number(seasonsMatch[1]);
    else if (outMatch) out = outMatch[1];
  }
  if (values.length === 0) throw new Error("Usage: --values=0,3,5,... [--seasons=N] [--out=path.json]");
  return { values, seasons, out };
}

/** Same convention as scripts/backtest-projection-methodology.ts: the last
 * `count` REGULAR seasons with no non-FINAL game on record, excluding the
 * current in-progress season. */
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

function bucketOf(result: GameBacktestResult): string {
  const n = Math.min(result.homeSeasonGamesSoFar, result.awaySeasonGamesSoFar);
  if (n < 5) return "0-4 (either team)";
  if (n < 10) return "5-9";
  if (n < 15) return "10-14";
  return "15+";
}
const BUCKETS = ["0-4 (either team)", "5-9", "10-14", "15+"];

async function main() {
  const { values, seasons: seasonCount, out } = parseArgs(process.argv.slice(2));

  const seasons = await selectCompletedRegularSeasons(seasonCount);
  if (seasons.length === 0) {
    console.error("No completed regular seasons found to backtest.");
    process.exitCode = 1;
    return;
  }
  const scoredSeasonIds = new Set(seasons.map((s) => s.id));
  console.log(`Backtesting ${seasons.length} completed regular season(s): ${seasons.map((s) => s.year).join(", ")}`);

  // Every FINAL game across every season — recency deliberately crosses
  // season boundaries, same as production, so history must too.
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

  const perValue: { value: number; results: GameBacktestResult[] }[] = [];
  for (const value of values) {
    console.log(`\nRunning candidate minSeasonGamesForRating=${value}...`);
    const results = runGameRatingFloorBacktest(allGames, scoredSeasonIds, value);
    perValue.push({ value, results });
    console.log(`  scored ${results.length} games`);
  }

  function summarize(results: GameBacktestResult[]) {
    const marginAcc = createErrorAccumulator();
    const totalAcc = createErrorAccumulator();
    let winnerCorrect = 0;
    let winnerGraded = 0;
    let extremeMargin = 0; // |marginError| > 20 — a blown-up single-game projection, not just noise
    for (const r of results) {
      addError(marginAcc, r.marginError, 0);
      addError(totalAcc, r.totalError, 0);
      if (Math.abs(r.marginError) > 20) extremeMargin += 1;
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
      extremeMarginRate: results.length > 0 ? extremeMargin / results.length : null,
    };
  }

  console.log("\nOverall, by candidate floor (lower MAE better; winner accuracy higher better):");
  console.table(
    perValue.map(({ value, results }) => {
      const s = summarize(results);
      return {
        minSeasonGamesForRating: value,
        n: s.n,
        marginMae: s.marginMae?.toFixed(3) ?? "n/a",
        marginBias: s.marginBias?.toFixed(3) ?? "n/a",
        totalMae: s.totalMae?.toFixed(3) ?? "n/a",
        winnerAccuracy: s.winnerAccuracy !== null ? (s.winnerAccuracy * 100).toFixed(1) + "%" : "n/a",
        extremeMarginRate: s.extremeMarginRate !== null ? (s.extremeMarginRate * 100).toFixed(1) + "%" : "n/a",
      };
    }),
  );

  for (const bucket of BUCKETS) {
    console.log(`\nBucket: games-into-season = ${bucket}`);
    console.table(
      perValue.map(({ value, results }) => {
        const bucketed = results.filter((r) => bucketOf(r) === bucket);
        const s = summarize(bucketed);
        return {
          minSeasonGamesForRating: value,
          n: s.n,
          marginMae: s.marginMae?.toFixed(3) ?? "n/a",
          marginBias: s.marginBias?.toFixed(3) ?? "n/a",
          totalMae: s.totalMae?.toFixed(3) ?? "n/a",
          winnerAccuracy: s.winnerAccuracy !== null ? (s.winnerAccuracy * 100).toFixed(1) + "%" : "n/a",
          extremeMarginRate: s.extremeMarginRate !== null ? (s.extremeMarginRate * 100).toFixed(1) + "%" : "n/a",
        };
      }),
    );
  }

  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        {
          seasons,
          overall: perValue.map(({ value, results }) => ({ value, ...summarize(results) })),
          byBucket: BUCKETS.map((bucket) => ({
            bucket,
            values: perValue.map(({ value, results }) => ({ value, ...summarize(results.filter((r) => bucketOf(r) === bucket)) })),
          })),
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote aggregates to ${out}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
