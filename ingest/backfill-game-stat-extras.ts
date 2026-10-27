/**
 * One-off backfill for the `starter` / `offensiveRebounds` / `defensiveRebounds`
 * columns added to PlayerGameStat/TeamGameStat after games were already
 * ingested. Those games already have rows (so `ingestMissingBoxscores`'s
 * "zero team_game_stat rows" self-heal check won't touch them) — this
 * re-fetches each game's box score summary and UPDATEs the existing rows
 * in place rather than re-inserting.
 *
 * Run with: npx tsx ingest/backfill-game-stat-extras.ts <year> [REGULAR|POSTSEASON]
 * e.g. npx tsx ingest/backfill-game-stat-extras.ts 2027 REGULAR
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import { mapPlayerGameStat, mapTeamGameStat, type EspnBoxscore } from "./mappers/boxscore";

interface EspnSummaryResponse {
  boxscore: EspnBoxscore;
}

async function backfillGame(
  gameId: number,
  eventEspnId: string,
  teamIdByEspnId: Map<string, number>,
  playerIdByEspnId: Map<string, number>,
) {
  const { boxscore } = await fetchEspnJson<EspnSummaryResponse>(espnEndpoints.summary(eventEspnId));

  for (const teamBox of boxscore.teams) {
    const teamId = teamIdByEspnId.get(teamBox.team.id);
    if (!teamId) continue;
    const mapped = mapTeamGameStat(teamBox, gameId, teamId, null);
    await prisma.teamGameStat.updateMany({
      where: { gameId, teamId },
      data: { offensiveRebounds: mapped.offensiveRebounds, defensiveRebounds: mapped.defensiveRebounds },
    });
  }

  for (const playerGroup of boxscore.players) {
    const teamId = teamIdByEspnId.get(playerGroup.team.id);
    if (!teamId) continue;
    const keys = playerGroup.statistics[0]?.keys ?? [];
    const athletes = playerGroup.statistics[0]?.athletes ?? [];

    for (const entry of athletes) {
      const playerId = entry.athlete?.id ? playerIdByEspnId.get(entry.athlete.id) : undefined;
      if (!playerId) continue;
      const mapped = mapPlayerGameStat(entry, keys, gameId, playerId, teamId);
      await prisma.playerGameStat.updateMany({
        where: { gameId, playerId },
        data: {
          starter: mapped.starter,
          offensiveRebounds: mapped.offensiveRebounds,
          defensiveRebounds: mapped.defensiveRebounds,
        },
      });
    }
  }
}

async function main() {
  const year = Number(process.argv[2]);
  const seasonType = (process.argv[3] ?? "REGULAR") as "REGULAR" | "POSTSEASON";
  if (!Number.isInteger(year)) {
    console.error("Usage: npx tsx ingest/backfill-game-stat-extras.ts <year> [REGULAR|POSTSEASON]");
    process.exit(1);
  }

  const season = await prisma.season.findUnique({ where: { year_type: { year, type: seasonType } } });
  if (!season) {
    console.error(`No season row for ${year} ${seasonType}`);
    process.exit(1);
  }

  const [games, teams, players] = await Promise.all([
    prisma.game.findMany({
      where: { seasonId: season.id, playerGameStats: { some: {} } },
      select: { id: true, espnId: true },
    }),
    prisma.team.findMany({ select: { id: true, espnId: true } }),
    prisma.player.findMany({ select: { id: true, espnId: true } }),
  ]);
  const teamIdByEspnId = new Map(teams.map((t) => [t.espnId, t.id]));
  const playerIdByEspnId = new Map(players.map((p) => [p.espnId, p.id]));

  let done = 0;
  const results = await Promise.allSettled(
    games.map(async (g) => {
      await backfillGame(g.id, g.espnId, teamIdByEspnId, playerIdByEspnId);
      done += 1;
      if (done % 50 === 0) console.log(`progress: ${done}/${games.length}`);
    }),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failures.forEach((f, i) => console.error(`backfill failure ${i + 1}/${failures.length}:`, f.reason));
  console.log(
    `backfill-game-stat-extras done: ${done}/${games.length} games for ${year} ${seasonType}, ${failures.length} failed — re-run to retry.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
