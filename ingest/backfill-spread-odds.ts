/**
 * One-time backfill: fills in the per-side spread/total vig fields
 * (`homeSpreadOdds`/`awaySpreadOdds`/`overOdds`/`underOdds`) and the open-
 * line columns for games whose `Odds` row predates those fields — early-
 * season games were backfilled via the retrospective `pickcenter` summary
 * endpoint (`mapOdds`, see backfill-odds.ts), which never carries them;
 * only the core API's single-provider resource (`mapCoreOdds`) does. That
 * resource turns out to still serve a provider's full line (open/close,
 * per-side vig) for already-FINAL games, not just scheduled ones — this
 * re-fetches it for any game currently missing `homeSpreadOdds` and
 * upserts the richer shape over the existing row.
 *
 * Self-healing like the rest of ingestion: re-running only touches rows
 * still missing `homeSpreadOdds`, so a partial/interrupted run is safe to
 * resume.
 *
 * Run with: npx tsx ingest/backfill-spread-odds.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson, EspnHttpError } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import { mapCoreOdds, type EspnCoreOddsEntry } from "./mappers/odds";

// Same single highest-priority provider the live sync already standardizes
// on (see sync-betting-odds.ts) — keeps every Odds row attributable to one
// sportsbook, not a mix.
const PROVIDER_ID = "100";

async function main() {
  const games = await prisma.game.findMany({
    where: { odds: { homeSpreadOdds: null } },
    select: { id: true, espnId: true, homeTeamId: true, awayTeamId: true },
  });
  console.log(`backfilling spread odds for ${games.length} games...`);

  let filled = 0;
  let missing = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    games.map(async (game) => {
      let coreOdds: EspnCoreOddsEntry;
      try {
        coreOdds = await fetchEspnJson<EspnCoreOddsEntry>(espnEndpoints.gameOdds(game.espnId, PROVIDER_ID));
      } catch (err) {
        if (err instanceof EspnHttpError) {
          missing += 1;
          return;
        }
        throw err;
      }
      const input = mapCoreOdds(coreOdds, game.id, game.homeTeamId, game.awayTeamId);
      await prisma.odds.update({ where: { gameId: game.id }, data: input });
      filled += 1;
    }),
  );

  failed = results.filter((r) => r.status === "rejected").length;
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`game ${games[i].espnId} failed:`, r.reason);
  });

  console.log(
    `\nSpread-odds backfill done: ${filled} filled, ${missing} had no provider odds available, ` +
      `${failed} failed (re-run to retry).`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
