/**
 * One-time backfill: re-checks every existing game for odds data, since
 * odds support was added after the games/box scores/plays backfill already
 * ran (see Odds model comment in schema.prisma). Re-fetches `summary` for
 * every game lacking an Odds row — most won't have any (confirmed
 * sparse/era-dependent coverage), but this fills in what's actually there.
 *
 * Self-healing like the rest of ingestion: re-running only touches games
 * still missing an Odds row, so a partial/interrupted run is safe to resume.
 *
 * Run with: npx tsx ingest/backfill-odds.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import { mapOdds, pickPrimaryProvider, type EspnPickcenterEntry } from "./mappers/odds";

interface EspnSummaryResponse {
  pickcenter?: EspnPickcenterEntry[];
}

async function main() {
  const games = await prisma.game.findMany({
    where: { odds: null },
    select: { id: true, espnId: true, homeTeamId: true, awayTeamId: true },
  });
  console.log(`checking ${games.length} games for odds data...`);

  let found = 0;
  let checked = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    games.map(async (game) => {
      const summary = await fetchEspnJson<EspnSummaryResponse>(espnEndpoints.summary(game.espnId));
      checked += 1;
      if (checked % 2000 === 0) console.log(`progress: ${checked}/${games.length} (${found} found so far)`);

      const primary = pickPrimaryProvider(summary.pickcenter);
      if (!primary) return;

      const input = mapOdds(primary, game.id, game.homeTeamId, game.awayTeamId);
      await prisma.odds.create({ data: input });
      found += 1;
    }),
  );

  failed = results.filter((r) => r.status === "rejected").length;
  console.log(`\nOdds backfill done: ${found} games with odds found, ${checked} checked, ${failed} failed (re-run to retry).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
