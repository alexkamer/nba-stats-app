/**
 * Betting projections — pre-game player availability sync (see
 * openspec/changes/add-player-availability-signal). For every still-
 * SCHEDULED game, fetches both teams' injury reports and upserts one
 * `PlayerAvailability` row per rostered player: a mapped status for
 * anyone on the injury report, AVAILABLE for everyone else (design.md
 * "Status resolution: ESPN's injury-report absence means available").
 *
 * Unlike PredictorSnapshot's write-once pattern, this refreshes on every
 * run while the game is still SCHEDULED — an injury status genuinely
 * changes pre-tip — and never touches a game that's no longer SCHEDULED.
 *
 * Run with: npx tsx ingest/sync-player-availability.ts
 */
import { prisma } from "./lib/db";
import { getTeamInjuries } from "../src/lib/espn-team-injuries";
import { mapInjuryStatus } from "../lib/espn/injury-status-mapping";

async function syncAvailabilityForGame(
  gameId: number,
  homeTeamEspnId: string,
  awayTeamEspnId: string,
  rosterPlayers: { id: number; espnId: string }[],
) {
  const [homeInjuries, awayInjuries] = await Promise.all([
    getTeamInjuries(homeTeamEspnId),
    getTeamInjuries(awayTeamEspnId),
  ]);
  const statusByEspnId = new Map<string, { status: ReturnType<typeof mapInjuryStatus>; comment: string | null }>();
  for (const injury of [...homeInjuries, ...awayInjuries]) {
    statusByEspnId.set(injury.athleteEspnId, { status: mapInjuryStatus(injury.status), comment: injury.comment });
  }

  const capturedAt = new Date();
  let upserted = 0;
  for (const player of rosterPlayers) {
    const entry = statusByEspnId.get(player.espnId);
    const data = {
      gameId,
      playerId: player.id,
      status: entry?.status ?? "AVAILABLE",
      comment: entry?.comment ?? null,
      capturedAt,
    } as const;
    await prisma.playerAvailability.upsert({
      where: { gameId_playerId: { gameId, playerId: player.id } },
      create: data,
      update: { status: data.status, comment: data.comment },
    });
    upserted += 1;
  }
  return upserted;
}

async function main() {
  const start = Date.now();

  const scheduledGames = await prisma.game.findMany({
    where: { status: "SCHEDULED" },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { espnId: true } },
      awayTeam: { select: { espnId: true } },
    },
  });

  const results = await Promise.allSettled(
    scheduledGames.map(async (game) => {
      const rosterPlayers = await prisma.player.findMany({
        where: { currentTeamId: { in: [game.homeTeamId, game.awayTeamId] } },
        select: { id: true, espnId: true },
      });
      return syncAvailabilityForGame(game.id, game.homeTeam.espnId, game.awayTeam.espnId, rosterPlayers);
    }),
  );

  const fulfilled = results.filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled");
  const rowsUpserted = fulfilled.reduce((sum, r) => sum + r.value, 0);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failures.forEach((f, i) => console.error(`sync-player-availability failure ${i + 1}/${failures.length}:`, f.reason));

  console.log(
    `sync-player-availability done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `${scheduledGames.length} scheduled games checked, ${rowsUpserted} availability rows upserted, ` +
      `${failures.length} games failed (re-run to retry).`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
