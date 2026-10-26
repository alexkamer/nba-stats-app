/**
 * M4 — backfill of completed games for one season (PLAN.md Sec 3/M4).
 * Scope per SPEC.md Sec 9.5: only games that are `final` are ever written;
 * preseason is excluded (Sec 9.7 — season_type is preseason/regular/postseason
 * only). Season/date range chosen with the user: 2025-26 (ESPN season year
 * 2026), the most recently completed season as of 2026-10-26.
 *
 * Thin wrapper around ingest/lib/game-ingest.ts (shared with the M6
 * incremental sync job) for the full-season date range.
 *
 * Run with: npx tsx ingest/backfill.ts
 */
import { prisma } from "./lib/db";
import { dateRange, discoverGames, ingestMissingBoxscores } from "./lib/game-ingest";

const SEASON_START = new Date("2025-10-21T00:00:00Z");
const SEASON_END = new Date("2026-06-10T00:00:00Z");

async function main() {
  const start = Date.now();
  const { maps } = await discoverGames(dateRange(SEASON_START, SEASON_END));
  await ingestMissingBoxscores(maps);
  console.log(`Backfill complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
