/**
 * M6 — incremental sync "heartbeat" (PLAN.md Sec 3/M6, SPEC.md Sec 7.2).
 * Checks a short recent window of dates for games that have gone `final`
 * since the last run and ingests them. This is the job that notices a game
 * finished and is what everything else (season stats, standings) should
 * refresh after.
 *
 * Shares all discovery/ingest logic with backfill.ts (ingest/lib/game-ingest.ts)
 * — the only difference is the date range: a short lookback window instead
 * of the whole season, since this is meant to run frequently (SPEC.md Sec
 * 7.2 suggests every 15-30 min).
 *
 * LOOKBACK_DAYS is wider than "just yesterday" on purpose: ESPN sometimes
 * finalizes a game's status/box score a little after midnight UTC, and a
 * missed run (sync job down, laptop asleep, etc.) shouldn't create a
 * permanent gap — discoverGames + ingestMissingBoxscores are both
 * idempotent/self-healing, so re-checking a few extra days costs a handful
 * of cheap scoreboard calls and skips everything already ingested.
 *
 * Run with: npx tsx ingest/sync-completed-games.ts
 */
import { prisma } from "./lib/db";
import { dateRange, discoverGames, ingestMissingBoxscores } from "./lib/game-ingest";

const LOOKBACK_DAYS = 4;

function recentDateRange(): Generator<string> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);
  return dateRange(start, end);
}

async function main() {
  const start = Date.now();
  const { maps, discovered } = await discoverGames(recentDateRange());
  const { done, failed } = await ingestMissingBoxscores(maps);
  console.log(
    `Incremental sync complete in ${((Date.now() - start) / 1000).toFixed(1)}s ` +
      `(${discovered} newly discovered, ${done} box scores ingested, ${failed} failed)`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
