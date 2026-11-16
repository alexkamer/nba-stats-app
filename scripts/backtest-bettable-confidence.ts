/**
 * Checks whether the game spread/total "bettable" confidence gate
 * (lib/projections/confidence.ts's `BETTABLE_EDGE_STDEV_MULTIPLIER = 0.75`,
 * fed by `ingest/generate-projections.ts`'s residual-based `marginStdev`/
 * `totalStdev`) is actually calibrated — does a bigger edge ratio really
 * mean a better hit rate, and is 0.75 a sane cutoff? Live grading data
 * showed bettable spread picks hitting 44% (worse than a coin flip), which
 * is what prompted this.
 *
 * Reuses the walk-forward, no-lookahead replay from
 * lib/projections/backtest-game-methodology.ts (now on the current,
 * flat-home-edge production `projectGame`) and adds, per game, a trailing
 * residual-stdev estimate over up to the last `RESIDUAL_BACKTEST_GAMES`
 * *already-projected* games — the same idea as
 * `computeResidualStdevs` in generate-projections.ts, but computed fresh
 * per game instead of once per run (strictly better: no staleness, and no
 * extra lookahead bias beyond what that function already documents).
 *
 * Needs real market lines to grade against, so this only scores seasons
 * with usable Odds coverage — 2024/2025 have none in this database and are
 * skipped automatically.
 *
 * Read-only: queries Game/Odds/Season only, never writes anything.
 *
 * Run with: npx tsx scripts/backtest-bettable-confidence.ts [--seasons=4]
 */
import { prisma } from "../ingest/lib/db";
import { projectGame, type TeamProjectionInput } from "../lib/projections/game-projection";
import { runGameBacktest, type GameOutcomeRow, type GameBacktestResult, type TeamSideContext } from "../lib/projections/backtest-game-methodology";
import { computeStdev, computeEdgeRatio, BETTABLE_EDGE_STDEV_MULTIPLIER } from "../lib/projections/confidence";
import { gradeSpreadCoverage, gradeTotalCoverage } from "../lib/accuracy/grade-game";

const DEFAULT_SEASONS = 4;
const RESIDUAL_BACKTEST_GAMES = 90; // matches generate-projections.ts
const MIN_ODDS_COVERAGE = 0.5; // seasons below this have too few lines to grade meaningfully

function parseArgs(argv: string[]): { seasons: number } {
  let seasons = DEFAULT_SEASONS;
  for (const arg of argv) {
    const m = arg.match(/^--seasons=(\d+)$/);
    if (m) seasons = Number(m[1]);
  }
  return { seasons };
}

/** Completed REGULAR seasons, most recent first, that also have usable
 * market-odds coverage — unlike the sibling scripts' selector, this one
 * must skip seasons with no Odds rows (2024/2025 in this database) since
 * there's nothing to grade a bettable pick against. */
async function selectSeasonsWithOdds(count: number): Promise<{ id: number; year: number }[]> {
  const regularSeasons = await prisma.season.findMany({
    where: { type: "REGULAR" },
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });
  const selected: { id: number; year: number }[] = [];
  for (const season of regularSeasons) {
    if (selected.length >= count) break;
    const [incompleteGames, totalGames, gamesWithOdds] = await Promise.all([
      prisma.game.count({ where: { seasonId: season.id, status: { not: "FINAL" } } }),
      prisma.game.count({ where: { seasonId: season.id, status: "FINAL" } }),
      prisma.game.count({ where: { seasonId: season.id, status: "FINAL", odds: { isNot: null } } }),
    ]);
    if (incompleteGames > 0 || totalGames === 0) continue;
    if (gamesWithOdds / totalGames < MIN_ODDS_COVERAGE) continue;
    selected.push(season);
  }
  return selected;
}

function bucketOf(ratio: number): string {
  if (ratio < 0.25) return "0.00-0.24";
  if (ratio < 0.5) return "0.25-0.49";
  if (ratio < 0.75) return "0.50-0.74";
  if (ratio < 1.0) return "0.75-0.99";
  if (ratio < 1.5) return "1.00-1.49";
  return "1.50+";
}
const BUCKETS = ["0.00-0.24", "0.25-0.49", "0.50-0.74", "0.75-0.99", "1.00-1.49", "1.50+"];

async function main() {
  const { seasons: seasonCount } = parseArgs(process.argv.slice(2));

  const seasons = await selectSeasonsWithOdds(seasonCount);
  if (seasons.length === 0) {
    console.error("No completed regular seasons with usable Odds coverage found.");
    process.exitCode = 1;
    return;
  }
  const scoredSeasonIds = new Set(seasons.map((s) => s.id));
  console.log(`Backtesting ${seasons.length} season(s) with Odds coverage: ${seasons.map((s) => s.year).join(", ")}`);

  const [gameRows, oddsRows] = await Promise.all([
    prisma.game.findMany({
      where: { status: "FINAL" },
      select: { id: true, date: true, seasonId: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
      orderBy: { date: "asc" },
    }),
    prisma.odds.findMany({ where: { game: { seasonId: { in: [...scoredSeasonIds] } } }, select: { gameId: true, spread: true, overUnder: true } }),
  ]);
  const allGames: GameOutcomeRow[] = gameRows
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
  // Odds.spread is home-team-relative favorite-negative — marketMargin is
  // its negation, same convention ingest/generate-projections.ts uses.
  const marketByGame = new Map(oddsRows.map((o) => [o.gameId, { marketMargin: o.spread != null ? -o.spread : null, marketTotal: o.overUnder }]));
  console.log(`Loaded ${allGames.length} FINAL games of league history, ${marketByGame.size} with market odds in scored seasons.`);

  const toInput = (ctx: TeamSideContext): TeamProjectionInput => ({
    seasonStat: ctx.seasonStat,
    recentGames: ctx.recentGames,
    rating: ctx.leagueAvgPoints !== undefined ? { recent: ctx.recentRating, season: ctx.seasonRating } : undefined,
    leagueAvgPoints: ctx.leagueAvgPoints,
  });
  const results = runGameBacktest(allGames, scoredSeasonIds, (home, away) => projectGame(toInput(home), toInput(away)));
  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  console.log(`Scored ${results.length} games.`);

  interface GradedPick {
    edgeRatio: number;
    correct: boolean | null;
  }
  const spreadPicks: GradedPick[] = [];
  const totalPicks: GradedPick[] = [];

  const marginErrors: number[] = [];
  const totalErrors: number[] = [];
  for (const r of results) {
    // Trailing residual stdev as of this game, using only strictly earlier
    // games' projection errors — no lookahead beyond what
    // computeResidualStdevs already documents (today's ratings applied
    // retroactively to past games, not each game's own frozen pick).
    const marginStdev = computeStdev(marginErrors.slice(-RESIDUAL_BACKTEST_GAMES));
    const totalStdev = computeStdev(totalErrors.slice(-RESIDUAL_BACKTEST_GAMES));
    marginErrors.push(r.marginError);
    totalErrors.push(r.totalError);

    const market = marketByGame.get(r.gameId);
    if (!market) continue;

    if (market.marketMargin !== null) {
      const edgeRatio = computeEdgeRatio(r.projectedMargin, market.marketMargin, marginStdev);
      if (edgeRatio !== null) {
        spreadPicks.push({ edgeRatio, correct: gradeSpreadCoverage(r.projectedMargin, market.marketMargin, r.actualMargin).correct });
      }
    }
    if (market.marketTotal !== null) {
      const edgeRatio = computeEdgeRatio(r.projectedTotal, market.marketTotal, totalStdev);
      if (edgeRatio !== null) {
        totalPicks.push({ edgeRatio, correct: gradeTotalCoverage(r.projectedTotal, market.marketTotal, r.actualTotal).correct });
      }
    }
  }

  function summarizeBucketed(picks: GradedPick[], label: string) {
    console.log(`\n${label} — hit rate by edge-ratio bucket (current bettable cutoff: ${BETTABLE_EDGE_STDEV_MULTIPLIER}):`);
    console.table(
      BUCKETS.map((bucket) => {
        const bucketed = picks.filter((p) => bucketOf(p.edgeRatio) === bucket);
        const graded = bucketed.filter((p) => p.correct !== null);
        const correct = graded.filter((p) => p.correct).length;
        return {
          edgeRatio: bucket,
          n: bucketed.length,
          graded: graded.length,
          hitRate: graded.length > 0 ? ((correct / graded.length) * 100).toFixed(1) + "%" : "n/a",
        };
      }),
    );

    const allGraded = picks.filter((p) => p.correct !== null);
    const allCorrect = allGraded.filter((p) => p.correct).length;
    const bettable = picks.filter((p) => p.edgeRatio >= BETTABLE_EDGE_STDEV_MULTIPLIER);
    const bettableGraded = bettable.filter((p) => p.correct !== null);
    const bettableCorrect = bettableGraded.filter((p) => p.correct).length;
    console.log(
      `${label} overall hit rate: ${((allCorrect / allGraded.length) * 100).toFixed(1)}% (n=${allGraded.length}) | ` +
        `bettable-only (edge >= ${BETTABLE_EDGE_STDEV_MULTIPLIER}): ${((bettableCorrect / bettableGraded.length) * 100).toFixed(1)}% (n=${bettableGraded.length})`,
    );
  }

  summarizeBucketed(spreadPicks, "SPREAD");
  summarizeBucketed(totalPicks, "TOTAL");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
