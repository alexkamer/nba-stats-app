/**
 * Validates the `fix-player-projection-season-scope` hypothesis before
 * that fix touches production code (see
 * openspec/changes/backtest-projection-methodology). Walks forward
 * through each player's game log and compares, for every historical game
 * in the configured window, what the current unscoped (career-average)
 * methodology and a proposed season-scoped methodology would have
 * projected against that player's own actual recorded stat value — no
 * market odds involved, and no look-ahead (a game at log index `i` is
 * never used to project itself or an earlier game).
 *
 * Read-only: queries PlayerGameStat/Game/Season only, never writes
 * anything, and never touches PlayerPropProjection/DailyBestBet or any
 * other table the live pipeline reads.
 *
 * Run with: npx tsx scripts/backtest-projection-methodology.ts [--seasons=N] [--out=path.json]
 */
import { prisma } from "../ingest/lib/db";
import { projectPlayerStat } from "../lib/projections/player-prop-projection";
import { extractStatValue } from "../lib/projections/extract-prop-stat";
import {
  METHODOLOGY_VARIANTS,
  hasPriorSeasonHistory,
  createErrorAccumulator,
  addError,
  meanAbsoluteError,
  meanSignedError,
  type BacktestLogEntry,
  type ErrorAccumulator,
} from "../lib/projections/backtest-methodology";
import type { PropStatType } from "../lib/espn/prop-types";
import { writeFileSync } from "fs";

const DEFAULT_SEASONS = 4;

// DOUBLE_DOUBLE/TRIPLE_DOUBLE are binary flags — mean absolute error isn't
// a meaningful metric for them (design.md non-goals); left for a future
// change if needed.
const STAT_TYPES: PropStatType[] = [
  "POINTS",
  "REBOUNDS",
  "ASSISTS",
  "THREE_POINTERS_MADE",
  "STEALS",
  "BLOCKS",
  "POINTS_ASSISTS",
  "POINTS_REBOUNDS",
  "REBOUNDS_ASSISTS",
  "POINTS_REBOUNDS_ASSISTS",
];

type Tenure = "veteran" | "firstTrackedSeason";
const TENURES: Tenure[] = ["veteran", "firstTrackedSeason"];

function parseArgs(argv: string[]): { seasons: number; out: string | null } {
  let seasons = DEFAULT_SEASONS;
  let out: string | null = null;
  for (const arg of argv) {
    const seasonsMatch = arg.match(/^--seasons=(\d+)$/);
    const outMatch = arg.match(/^--out=(.+)$/);
    if (seasonsMatch) seasons = Number(seasonsMatch[1]);
    else if (outMatch) out = outMatch[1];
  }
  return { seasons, out };
}

/** The last `count` REGULAR seasons that have no non-FINAL game on record
 * (i.e. fully played out) — excludes the current, still-in-progress
 * season even though some of its games are already FINAL. */
async function selectCompletedRegularSeasons(count: number): Promise<{ id: number; year: number }[]> {
  const regularSeasons = await prisma.season.findMany({
    where: { type: "REGULAR" },
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });

  const completed: { id: number; year: number }[] = [];
  for (const season of regularSeasons) {
    if (completed.length >= count) break;
    const incompleteGames = await prisma.game.count({
      where: { seasonId: season.id, status: { not: "FINAL" } },
    });
    if (incompleteGames === 0) completed.push(season);
  }
  return completed;
}

interface PlayerLog {
  entries: BacktestLogEntry[];
}

async function loadAllPlayerLogs(): Promise<Map<number, PlayerLog>> {
  const rows = await prisma.playerGameStat.findMany({
    where: { points: { not: null }, game: { status: "FINAL" } },
    orderBy: { game: { date: "asc" } },
    select: {
      gameId: true,
      playerId: true,
      points: true,
      rebounds: true,
      assists: true,
      threeMade: true,
      steals: true,
      blocks: true,
      minutes: true,
      game: { select: { date: true, seasonId: true } },
    },
  });

  const logs = new Map<number, PlayerLog>();
  for (const row of rows) {
    let log = logs.get(row.playerId);
    if (!log) {
      log = { entries: [] };
      logs.set(row.playerId, log);
    }
    log.entries.push({
      gameId: row.gameId,
      date: row.game.date,
      seasonId: row.game.seasonId,
      points: row.points,
      rebounds: row.rebounds,
      assists: row.assists,
      threeMade: row.threeMade,
      steals: row.steals,
      blocks: row.blocks,
      minutes: row.minutes,
    });
  }
  return logs;
}

interface AggregateKey {
  variant: string;
  statType: PropStatType;
  tenure: Tenure;
}

function keyFor({ variant, statType, tenure }: AggregateKey): string {
  return `${variant}|${statType}|${tenure}`;
}

async function main() {
  const { seasons: seasonCount, out } = parseArgs(process.argv.slice(2));

  const seasons = await selectCompletedRegularSeasons(seasonCount);
  if (seasons.length === 0) {
    console.error("No completed regular seasons found to backtest.");
    process.exitCode = 1;
    return;
  }
  const scoredSeasonIds = new Set(seasons.map((s) => s.id));
  console.log(
    `Backtesting ${seasons.length} completed regular season(s): ${seasons.map((s) => s.year).join(", ")}`,
  );

  const playerLogs = await loadAllPlayerLogs();
  console.log(`Loaded game logs for ${playerLogs.size} players.`);

  const accumulators = new Map<string, ErrorAccumulator>();
  for (const variant of Object.keys(METHODOLOGY_VARIANTS)) {
    for (const statType of STAT_TYPES) {
      for (const tenure of TENURES) {
        accumulators.set(keyFor({ variant, statType, tenure }), createErrorAccumulator());
      }
    }
  }

  const gamesPerSeason = new Map<number, Set<number>>();
  for (const season of seasons) gamesPerSeason.set(season.id, new Set());

  let scoredPlayerGames = 0;
  for (const log of playerLogs.values()) {
    for (let i = 0; i < log.entries.length; i++) {
      const target = log.entries[i];
      if (!scoredSeasonIds.has(target.seasonId)) continue;

      gamesPerSeason.get(target.seasonId)!.add(target.gameId);
      scoredPlayerGames += 1;
      const tenure: Tenure = hasPriorSeasonHistory(log.entries, i) ? "veteran" : "firstTrackedSeason";

      for (const statType of STAT_TYPES) {
        const actual = extractStatValue(statType, target);
        for (const [variantName, variantFn] of Object.entries(METHODOLOGY_VARIANTS)) {
          const inputs = variantFn(log.entries, i, statType);
          const projected = projectPlayerStat(inputs);
          // Matches the live pipeline: insufficient data means no
          // projection is produced, not a fabricated one, so it's simply
          // not graded rather than counted as an error.
          if (projected === null) continue;
          addError(accumulators.get(keyFor({ variant: variantName, statType, tenure }))!, projected, actual);
        }
      }
    }
  }

  console.log(`Scored ${scoredPlayerGames} player-games.`);

  const rows = [];
  for (const variant of Object.keys(METHODOLOGY_VARIANTS)) {
    for (const statType of STAT_TYPES) {
      for (const tenure of TENURES) {
        const acc = accumulators.get(keyFor({ variant, statType, tenure }))!;
        rows.push({
          variant,
          statType,
          tenure,
          n: acc.n,
          mae: meanAbsoluteError(acc),
          bias: meanSignedError(acc),
        });
      }
    }
  }

  console.log("\nPrediction error by variant / stat type / tenure (lower MAE is better; bias near 0 is better):");
  console.table(
    rows.map((r) => ({
      variant: r.variant,
      statType: r.statType,
      tenure: r.tenure,
      n: r.n,
      mae: r.mae !== null ? r.mae.toFixed(3) : "n/a",
      bias: r.bias !== null ? r.bias.toFixed(3) : "n/a",
    })),
  );

  console.log("\nGames per scored season:");
  console.table(
    seasons.map((s) => ({ year: s.year, seasonId: s.id, games: gamesPerSeason.get(s.id)!.size })),
  );

  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        {
          seasons: seasons.map((s) => ({
            year: s.year,
            seasonId: s.id,
            games: gamesPerSeason.get(s.id)!.size,
          })),
          scoredPlayerGames,
          results: rows,
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
