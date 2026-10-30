/**
 * Betting insights — forward-looking odds/props/predictor sync (see
 * openspec/changes/add-betting-insights-page). Discovers upcoming games
 * (scoreboard walk, like `discoverGames`, but forward instead of
 * backward-looking), then for each still-scheduled game fetches/upserts:
 *   - market odds with line movement (Odds, via the core API's single-
 *     provider resource — richer than `pickcenter`)
 *   - player prop odds (PlayerPropOdds)
 *   - a one-time ESPN predictor snapshot (PredictorSnapshot), since ESPN
 *     does not retain that value once the game goes final
 *
 * Self-healing like the rest of ingestion: re-running only touches games
 * still SCHEDULED, and upserts are safe to repeat.
 *
 * Run with: npx tsx ingest/sync-betting-odds.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson, EspnHttpError } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import { dateRange, discoverGames } from "./lib/game-ingest";
import { mapCoreOdds, type EspnCoreOddsEntry } from "./mappers/odds";
import { mapPlayerPropBets, type EspnPropBetItem } from "./mappers/player-props";
import { mapPredictor, type EspnPredictorEntry } from "./mappers/predictor";

// DraftKings in current testing — the single highest-priority provider ESPN
// lists, matching the existing Odds model's precedent (see design.md
// "No multi-sportsbook comparison").
const PROVIDER_ID = "100";
const PROVIDER_NAME = "DraftKings";

// How far ahead to look for upcoming games. The NBA schedules games well in
// advance, but odds/props/predictor only tend to populate close to tip-off,
// so there's little value walking further out.
const LOOKAHEAD_DAYS = 3;

interface EspnPropBetsResponse {
  items: EspnPropBetItem[];
  pageCount: number;
}

interface EspnSummaryResponse {
  predictor?: EspnPredictorEntry;
}

function upcomingDateRange(): Generator<string> {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + LOOKAHEAD_DAYS);
  return dateRange(start, end);
}

async function fetchOrNull<T>(url: string): Promise<T | null> {
  try {
    return await fetchEspnJson<T>(url);
  } catch (err) {
    // A scheduled game with no odds/props/predictor published yet is
    // expected (see betting-odds-ingest "Sparse or missing data handling")
    // — ESPN returns 404s for those, not an empty body.
    if (err instanceof EspnHttpError) return null;
    throw err;
  }
}

async function syncOddsForGame(gameId: number, espnId: string, homeTeamId: number, awayTeamId: number) {
  const coreOdds = await fetchOrNull<EspnCoreOddsEntry>(espnEndpoints.gameOdds(espnId, PROVIDER_ID));
  if (!coreOdds) return false;
  const input = mapCoreOdds(coreOdds, gameId, homeTeamId, awayTeamId);
  await prisma.odds.upsert({ where: { gameId }, create: input, update: input });
  return true;
}

async function syncPredictorForGame(gameId: number, espnId: string) {
  const existing = await prisma.predictorSnapshot.findUnique({ where: { gameId } });
  if (existing) return false;

  const summary = await fetchOrNull<EspnSummaryResponse>(espnEndpoints.summary(espnId));
  const input = mapPredictor(summary?.predictor, gameId);
  if (!input) return false;
  await prisma.predictorSnapshot.create({ data: input });
  return true;
}

async function fetchAllPropBets(espnId: string): Promise<EspnPropBetItem[]> {
  const items: EspnPropBetItem[] = [];
  let page = 1;
  while (true) {
    const data = await fetchOrNull<EspnPropBetsResponse>(espnEndpoints.gamePropBets(espnId, PROVIDER_ID, page));
    if (!data || data.items.length === 0) break;
    items.push(...data.items);
    if (page >= data.pageCount) break;
    page += 1;
  }
  return items;
}

async function syncPropsForGame(gameId: number, espnId: string, playerIdByEspnId: Map<string, number>) {
  const items = await fetchAllPropBets(espnId);
  const inputs = mapPlayerPropBets(items, gameId, playerIdByEspnId, PROVIDER_NAME);
  for (const input of inputs) {
    await prisma.playerPropOdds.upsert({
      where: {
        gameId_playerId_statType_side: {
          gameId: input.gameId,
          playerId: input.playerId,
          statType: input.statType,
          side: input.side,
        },
      },
      create: input,
      update: input,
    });
  }
  return inputs.length;
}

async function main() {
  const start = Date.now();

  // Ensure Game rows exist for upcoming games before trying to attach
  // odds/props/predictor to them.
  const { discovered } = await discoverGames(upcomingDateRange());

  const scheduledGames = await prisma.game.findMany({
    where: { status: "SCHEDULED" },
    select: { id: true, espnId: true, homeTeamId: true, awayTeamId: true },
  });
  const players = await prisma.player.findMany({ select: { id: true, espnId: true } });
  const playerIdByEspnId = new Map(players.map((p) => [p.espnId, p.id]));

  let oddsSynced = 0;
  let predictorsCaptured = 0;
  let propRowsUpserted = 0;

  const results = await Promise.allSettled(
    scheduledGames.map(async (game) => {
      const [hasOdds, gotPredictor, propCount] = await Promise.all([
        syncOddsForGame(game.id, game.espnId, game.homeTeamId, game.awayTeamId),
        syncPredictorForGame(game.id, game.espnId),
        syncPropsForGame(game.id, game.espnId, playerIdByEspnId),
      ]);
      if (hasOdds) oddsSynced += 1;
      if (gotPredictor) predictorsCaptured += 1;
      propRowsUpserted += propCount;
    }),
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failures.forEach((f, i) => console.error(`sync-betting-odds failure ${i + 1}/${failures.length}:`, f.reason));

  console.log(
    `sync-betting-odds done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `${discovered} upcoming games discovered, ${scheduledGames.length} scheduled games checked, ` +
      `${oddsSynced} with odds, ${predictorsCaptured} new predictor snapshots, ` +
      `${propRowsUpserted} prop odds rows upserted, ${failures.length} games failed (re-run to retry).`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
