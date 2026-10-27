/**
 * Historical backfill — generalizes M4's single-season backfill.ts to any
 * season year(s), per the user's decision to go back to 2002-03 (the
 * earliest season with full score+box score+play-by-play data; confirmed
 * by direct ESPN probing — see PLAN.md's historical-backfill research
 * notes). Also runs sync-team-identity for each year first, since team
 * espnIds are stable across relocation/rename (e.g. Seattle SuperSonics ->
 * OKC Thunder) but display name/colors/logo are era-specific.
 *
 * Date range per year is deliberately generous (Oct 1 of year-1 through
 * July 20 of year) rather than precisely probed per season — empty days
 * are cheap (one scoreboard call, 0 events) and this avoids needing to
 * hand-verify ~20 seasons' exact start/end dates.
 *
 * Run with: npx tsx ingest/backfill-historical.ts <startYear> <endYear>
 * e.g. npx tsx ingest/backfill-historical.ts 2003 2025
 */
import { prisma } from "./lib/db";
import { dateRange, discoverGames, ingestMissingBoxscores } from "./lib/game-ingest";
import { syncTeamIdentityForYear } from "./sync-team-identity";

function seasonDateRange(year: number): Generator<string> {
  const start = new Date(`${year - 1}-10-01T00:00:00Z`);
  const end = new Date(`${year}-07-20T00:00:00Z`);
  return dateRange(start, end);
}

async function backfillSeason(year: number) {
  console.log(`\n========== Season ${year - 1}-${String(year).slice(-2)} (year ${year}) ==========`);
  const start = Date.now();

  await syncTeamIdentityForYear(year);

  const { maps } = await discoverGames(seasonDateRange(year));
  await ingestMissingBoxscores(maps);

  console.log(`Season ${year} complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

async function main() {
  const startYear = Number(process.argv[2]);
  const endYear = Number(process.argv[3] ?? process.argv[2]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    console.error("Usage: npx tsx ingest/backfill-historical.ts <startYear> [endYear]");
    process.exit(1);
  }

  const overallStart = Date.now();
  for (let year = startYear; year <= endYear; year++) {
    await backfillSeason(year);
  }
  console.log(`\nAll seasons (${startYear}-${endYear}) complete in ${((Date.now() - overallStart) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
