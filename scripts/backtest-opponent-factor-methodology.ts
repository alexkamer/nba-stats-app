/**
 * Validates whether `loadOpponentFactors()`'s missing season filter (see
 * openspec/changes/backtest-opponent-factor-methodology, and the
 * "Follow-up findings" section of fix-player-projection-season-scope's
 * proposal.md) actually matters before that function is changed. Walks
 * forward through the league's full team-game history and compares, for
 * every historical team-game in the configured window, what the current
 * unscoped (all-time) opponent-factor computation and a season-scoped one
 * would have predicted a team to allow in a stat — both run through the
 * real, unmodified `computeOpponentFactors` — against what the opponent
 * actually recorded.
 *
 * Read-only: queries TeamGameStat/Game/Season only, never writes anything.
 *
 * Run with: npx tsx scripts/backtest-opponent-factor-methodology.ts [--seasons=N] [--out=path.json]
 */
import { prisma } from "../ingest/lib/db";
import {
  computeOpponentPrediction,
  predictedAllowedValue,
  seasonProgressBucket,
  type TeamAllowedEntry,
} from "../lib/projections/backtest-opponent-factor";
import { extractStatValue } from "../lib/projections/extract-prop-stat";
import {
  createErrorAccumulator,
  addError,
  meanAbsoluteError,
  meanSignedError,
  type ErrorAccumulator,
} from "../lib/projections/backtest-methodology";
import type { PropStatType } from "../lib/espn/prop-types";
import { writeFileSync } from "fs";

const DEFAULT_SEASONS = 4;

// Matches ingest/generate-projections.ts's OPPONENT_ADJUSTABLE_STATS — the
// only stats the live pipeline actually computes opponent factors for.
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

const VARIANTS = ["unscoped", "seasonScoped"] as const;
type Variant = (typeof VARIANTS)[number];

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

/** Same convention as scripts/backtest-projection-methodology.ts: the last
 * `count` REGULAR seasons with no non-FINAL game on record. */
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

/** One entry per team per FINAL game (two per game), sorted ascending by
 * date, each paired with the opposing team's box score for that game. */
async function loadAllTeamAllowedEntries(): Promise<TeamAllowedEntry[]> {
  const rows = await prisma.teamGameStat.findMany({
    where: { game: { status: "FINAL" } },
    orderBy: { game: { date: "asc" } },
    select: {
      gameId: true,
      teamId: true,
      points: true,
      rebounds: true,
      assists: true,
      threeMade: true,
      steals: true,
      blocks: true,
      game: { select: { date: true, seasonId: true } },
    },
  });

  const byGame = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byGame.get(row.gameId);
    if (list) list.push(row);
    else byGame.set(row.gameId, [row]);
  }

  const entries: TeamAllowedEntry[] = [];
  for (const pair of byGame.values()) {
    if (pair.length !== 2) continue; // only games with both teams' box scores ingested
    const [a, b] = pair;
    const toRow = (r: (typeof pair)[number]) => ({
      points: r.points,
      rebounds: r.rebounds,
      assists: r.assists,
      threeMade: r.threeMade,
      steals: r.steals,
      blocks: r.blocks,
      minutes: null,
    });
    entries.push({ gameId: a.gameId, date: a.game.date, seasonId: a.game.seasonId, teamId: a.teamId, opponentRow: toRow(b) });
    entries.push({ gameId: b.gameId, date: b.game.date, seasonId: b.game.seasonId, teamId: b.teamId, opponentRow: toRow(a) });
  }
  entries.sort((x, y) => x.date.getTime() - y.date.getTime());
  return entries;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface AggregateKey {
  variant: Variant;
  statType: PropStatType;
  bucket: string;
}
function keyFor({ variant, statType, bucket }: AggregateKey): string {
  return `${variant}|${statType}|${bucket}`;
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

  const allEntries = await loadAllTeamAllowedEntries();
  console.log(`Loaded ${allEntries.length} team-game allowed entries.`);

  // First index in allEntries where each season's entries begin — seasons
  // never interleave in date order, so this is a single forward scan.
  const seasonStartIndex = new Map<number, number>();
  for (let i = 0; i < allEntries.length; i++) {
    if (!seasonStartIndex.has(allEntries[i].seasonId)) seasonStartIndex.set(allEntries[i].seasonId, i);
  }

  // Partition into calendar-day groups, preserving order, so every game
  // sharing a cutoff date reuses the same computeOpponentFactors call
  // instead of recomputing per game.
  const dayGroups: { key: string; startIndex: number; endIndex: number }[] = [];
  for (let i = 0; i < allEntries.length; i++) {
    const key = dayKey(allEntries[i].date);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.key === key) last.endIndex = i + 1;
    else dayGroups.push({ key, startIndex: i, endIndex: i + 1 });
  }

  const accumulators = new Map<string, ErrorAccumulator>();
  const gamesPlayedSoFar = new Map<string, number>(); // `${teamId}|${seasonId}` -> count

  const gamesPerSeason = new Map<number, Set<number>>();
  for (const season of seasons) gamesPerSeason.set(season.id, new Set());

  let scoredTeamGames = 0;
  for (const day of dayGroups) {
    const dayEntries = allEntries.slice(day.startIndex, day.endIndex);
    const daySeasonId = dayEntries[0].seasonId;
    const isScoredDay = scoredSeasonIds.has(daySeasonId);

    if (isScoredDay) {
      const unscopedHistory = allEntries.slice(0, day.startIndex);
      const seasonHistory = allEntries.slice(seasonStartIndex.get(daySeasonId)!, day.startIndex);

      for (const statType of STAT_TYPES) {
        const unscopedPrediction = computeOpponentPrediction(unscopedHistory, statType);
        const seasonPrediction = computeOpponentPrediction(seasonHistory, statType);

        for (const entry of dayEntries) {
          gamesPerSeason.get(entry.seasonId)!.add(entry.gameId);
          const actual = extractStatValue(statType, entry.opponentRow);
          const playedSoFar = gamesPlayedSoFar.get(`${entry.teamId}|${entry.seasonId}`) ?? 0;
          const bucket = seasonProgressBucket(playedSoFar);

          const unscopedPredicted = predictedAllowedValue(unscopedPrediction, entry.teamId);
          if (unscopedPredicted !== null) {
            addError(
              accumulators.get(keyFor({ variant: "unscoped", statType, bucket })) ??
                (() => {
                  const acc = createErrorAccumulator();
                  accumulators.set(keyFor({ variant: "unscoped", statType, bucket }), acc);
                  return acc;
                })(),
              unscopedPredicted,
              actual,
            );
          }
          const seasonPredicted = predictedAllowedValue(seasonPrediction, entry.teamId);
          if (seasonPredicted !== null) {
            addError(
              accumulators.get(keyFor({ variant: "seasonScoped", statType, bucket })) ??
                (() => {
                  const acc = createErrorAccumulator();
                  accumulators.set(keyFor({ variant: "seasonScoped", statType, bucket }), acc);
                  return acc;
                })(),
              seasonPredicted,
              actual,
            );
          }
        }
      }
      scoredTeamGames += dayEntries.length;
    }

    // Advance each team's current-season played-games counter after
    // grading this day, so later days see today's games as history.
    for (const entry of dayEntries) {
      const key = `${entry.teamId}|${entry.seasonId}`;
      gamesPlayedSoFar.set(key, (gamesPlayedSoFar.get(key) ?? 0) + 1);
    }
  }

  console.log(`Scored ${scoredTeamGames} team-game entries.`);

  const buckets = ["0-4", "5-14", "15+"];
  const rows: { variant: Variant; statType: PropStatType; bucket: string; n: number; mae: number | null; bias: number | null }[] = [];
  for (const variant of VARIANTS) {
    for (const statType of STAT_TYPES) {
      for (const bucket of buckets) {
        const acc = accumulators.get(keyFor({ variant, statType, bucket })) ?? createErrorAccumulator();
        rows.push({ variant, statType, bucket, n: acc.n, mae: meanAbsoluteError(acc), bias: meanSignedError(acc) });
      }
    }
  }

  console.log("\nPrediction error by variant / stat type / season-progress bucket (lower MAE is better; bias near 0 is better):");
  console.table(
    rows.map((r) => ({
      variant: r.variant,
      statType: r.statType,
      bucket: r.bucket,
      n: r.n,
      mae: r.mae !== null ? r.mae.toFixed(3) : "n/a",
      bias: r.bias !== null ? r.bias.toFixed(3) : "n/a",
    })),
  );

  console.log("\nGames per scored season:");
  console.table(seasons.map((s) => ({ year: s.year, seasonId: s.id, games: gamesPerSeason.get(s.id)!.size })));

  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        {
          seasons: seasons.map((s) => ({ year: s.year, seasonId: s.id, games: gamesPerSeason.get(s.id)!.size })),
          scoredTeamGames,
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
