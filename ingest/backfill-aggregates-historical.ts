/**
 * Backfills standings + team/player season stats for a range of historical
 * seasons, now that their games/box scores are in (see
 * ingest/backfill-historical.ts). Reuses sync-aggregates.ts's logic per
 * year — the only difference from the recurring M6 case is the year range.
 *
 * Run with: npx tsx ingest/backfill-aggregates-historical.ts <startYear> [endYear]
 * e.g. npx tsx ingest/backfill-aggregates-historical.ts 2003 2025
 */
import { prisma } from "./lib/db";
import { syncAggregatesForYear } from "./sync-aggregates";

async function main() {
  const startYear = Number(process.argv[2]);
  const endYear = Number(process.argv[3] ?? process.argv[2]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    console.error("Usage: npx tsx ingest/backfill-aggregates-historical.ts <startYear> [endYear]");
    process.exit(1);
  }

  const start = Date.now();
  for (let year = startYear; year <= endYear; year++) {
    await syncAggregatesForYear(year);
  }
  console.log(`\nAggregates for ${startYear}-${endYear} complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
