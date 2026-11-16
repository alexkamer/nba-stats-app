/**
 * Reusable hyperparameter sweep for lib/projections/player-prop-projection.ts's
 * constants, against real historical outcomes (see
 * openspec/changes/tune-minutes-trend-clamp). Generalizes two ad hoc
 * sweeps run during that change's exploration into one tool: given a
 * parameter name and a list of candidate values, walks forward through
 * the last 4 completed regular seasons (same season-scoped methodology as
 * scripts/backtest-projection-methodology.ts) and reports MAE/bias per
 * candidate per stat type.
 *
 * Read-only: queries PlayerGameStat/Game/Season only, never writes
 * anything.
 *
 * Run with:
 *   npx tsx scripts/sweep-projection-hyperparameters.ts --param=trendClampHalfWidth --values=0,0.1,0.3,1.0
 *   npx tsx scripts/sweep-projection-hyperparameters.ts --param=recentFormWeight --values=0.3,0.4,0.5,0.6,0.7,0.8,0.9
 */
import { prisma } from "../ingest/lib/db";
import {
  seasonScopedVariant,
  createErrorAccumulator,
  addError,
  meanAbsoluteError,
  meanSignedError,
  type BacktestLogEntry,
  type ErrorAccumulator,
  type MethodologyVariantInputs,
} from "../lib/projections/backtest-methodology";
import { extractStatValue } from "../lib/projections/extract-prop-stat";
import type { PropStatType } from "../lib/espn/prop-types";

const DEFAULT_SEASONS = 4;
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

const MIN_RECENT_GAMES_FOR_BLEND = 3;
const TREND_WINDOW_GAMES = 3;
// Production defaults, used for whichever parameter ISN'T the one being swept.
const DEFAULT_RECENT_FORM_WEIGHT = 0.6;
const DEFAULT_TREND_CLAMP_HALF_WIDTH = 0.1; // [0.9, 1.1] after this change ships

type SweepableParam = "recentFormWeight" | "trendClampHalfWidth";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trendMultiplier(recentMinutes: number[], halfWidth: number): number {
  if (halfWidth === 0 || recentMinutes.length < TREND_WINDOW_GAMES) return 1;
  const overallAvg = average(recentMinutes);
  const trendAvg = average(recentMinutes.slice(-TREND_WINDOW_GAMES));
  if (!overallAvg || !trendAvg) return 1;
  return Math.min(1 + halfWidth, Math.max(1 - halfWidth, trendAvg / overallAvg));
}

/** Mirrors projectPlayerStat's blend/trend formula exactly, but with
 * recentFormWeight and the trend clamp's half-width as parameters instead
 * of hardcoded constants, so either can be swept independently while the
 * other stays at its production (or candidate) default. Opponent factor
 * is intentionally omitted — out of scope for this sweep (design.md). */
function projectWithParams(
  inputs: MethodologyVariantInputs,
  recentFormWeight: number,
  trendClampHalfWidth: number,
): number | null {
  const recentAvg = average(inputs.recentValues);
  let blended: number | null;
  if (recentAvg !== null && inputs.recentValues.length >= MIN_RECENT_GAMES_FOR_BLEND) {
    blended =
      inputs.seasonAverage !== null
        ? recentFormWeight * recentAvg + (1 - recentFormWeight) * inputs.seasonAverage
        : recentAvg;
  } else {
    blended = inputs.seasonAverage;
  }
  if (blended === null) return null;
  return blended * trendMultiplier(inputs.recentMinutes, trendClampHalfWidth);
}

function parseArgs(argv: string[]): { param: SweepableParam; values: number[]; seasons: number } {
  let param: SweepableParam | null = null;
  let values: number[] = [];
  let seasons = DEFAULT_SEASONS;
  for (const arg of argv) {
    const paramMatch = arg.match(/^--param=(.+)$/);
    const valuesMatch = arg.match(/^--values=(.+)$/);
    const seasonsMatch = arg.match(/^--seasons=(\d+)$/);
    if (paramMatch) {
      if (paramMatch[1] !== "recentFormWeight" && paramMatch[1] !== "trendClampHalfWidth") {
        throw new Error(`Unknown --param: ${paramMatch[1]} (expected recentFormWeight or trendClampHalfWidth)`);
      }
      param = paramMatch[1];
    } else if (valuesMatch) {
      values = valuesMatch[1].split(",").map(Number);
    } else if (seasonsMatch) {
      seasons = Number(seasonsMatch[1]);
    }
  }
  if (!param || values.length === 0) {
    throw new Error("Usage: --param=recentFormWeight|trendClampHalfWidth --values=v1,v2,... [--seasons=N]");
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

async function main() {
  const { param, values, seasons: seasonCount } = parseArgs(process.argv.slice(2));

  const seasons = await selectCompletedRegularSeasons(seasonCount);
  const scoredSeasonIds = new Set(seasons.map((s) => s.id));
  console.log(`Sweeping "${param}" over [${values.join(", ")}] across ${seasons.length} completed regular season(s): ${seasons.map((s) => s.year).join(", ")}`);

  const rows = await prisma.playerGameStat.findMany({
    where: { points: { not: null }, game: { status: "FINAL" } },
    orderBy: { game: { date: "asc" } },
    select: {
      playerId: true, points: true, rebounds: true, assists: true,
      threeMade: true, steals: true, blocks: true, minutes: true,
      game: { select: { date: true, seasonId: true } },
    },
  });

  const logs = new Map<number, BacktestLogEntry[]>();
  for (const r of rows) {
    let log = logs.get(r.playerId);
    if (!log) { log = []; logs.set(r.playerId, log); }
    log.push({
      gameId: 0, date: r.game.date, seasonId: r.game.seasonId,
      points: r.points, rebounds: r.rebounds, assists: r.assists,
      threeMade: r.threeMade, steals: r.steals, blocks: r.blocks, minutes: r.minutes,
    });
  }
  console.log(`Loaded game logs for ${logs.size} players.`);

  const accs = new Map<string, ErrorAccumulator>();
  const key = (value: number, statType: PropStatType) => `${value}|${statType}`;

  let scored = 0;
  for (const log of logs.values()) {
    for (let i = 0; i < log.length; i++) {
      if (!scoredSeasonIds.has(log[i].seasonId)) continue;
      scored += 1;
      for (const statType of STAT_TYPES) {
        const actual = extractStatValue(statType, log[i]);
        const inputs = seasonScopedVariant(log, i, statType);
        for (const value of values) {
          const recentFormWeight = param === "recentFormWeight" ? value : DEFAULT_RECENT_FORM_WEIGHT;
          const trendClampHalfWidth = param === "trendClampHalfWidth" ? value : DEFAULT_TREND_CLAMP_HALF_WIDTH;
          const projected = projectWithParams(inputs, recentFormWeight, trendClampHalfWidth);
          if (projected === null) continue;
          const k = key(value, statType);
          if (!accs.has(k)) accs.set(k, createErrorAccumulator());
          addError(accs.get(k)!, projected, actual);
        }
      }
    }
  }
  console.log(`Scored ${scored} player-games.`);

  for (const statType of STAT_TYPES) {
    console.log(`\n=== ${statType} ===`);
    console.table(
      values.map((value) => {
        const acc = accs.get(key(value, statType))!;
        return {
          [param]: value,
          n: acc.n,
          mae: meanAbsoluteError(acc)?.toFixed(4) ?? "n/a",
          bias: meanSignedError(acc)?.toFixed(4) ?? "n/a",
        };
      }),
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
