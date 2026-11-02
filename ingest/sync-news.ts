/**
 * M10 (stretch) — news ingestion (PLAN.md Sec 3/M10, SPEC.md Sec 5.7/Sec 7).
 * Upserts articles by espnId and relinks their team/player associations
 * every run (join rows are cheap to fully replace rather than diff).
 *
 * Run with: npx tsx ingest/sync-news.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import {
  athleteEspnIdsOf,
  mapNewsArticle,
  teamEspnIdsOf,
  type EspnNewsArticle,
} from "./mappers/news";

interface EspnNewsResponse {
  headlines: EspnNewsArticle[];
}

async function main() {
  const [teams, players] = await Promise.all([
    prisma.team.findMany({ select: { id: true, espnId: true } }),
    prisma.player.findMany({ select: { id: true, espnId: true } }),
  ]);
  const teamIdByEspnId = new Map(teams.map((t) => [t.espnId, t.id]));
  const playerIdByEspnId = new Map(players.map((p) => [p.espnId, p.id]));

  const { headlines } = await fetchEspnJson<EspnNewsResponse>(espnEndpoints.news(50));

  let synced = 0;
  for (const article of headlines) {
    const input = mapNewsArticle(article);
    const row = await prisma.newsArticle.upsert({
      where: { espnId: input.espnId },
      create: input,
      update: input,
    });

    // Relink associations fresh each run — cheap to fully replace rather
    // than diff for a 50-row join.
    await prisma.newsArticleTeam.deleteMany({ where: { newsArticleId: row.id } });
    await prisma.newsArticlePlayer.deleteMany({ where: { newsArticleId: row.id } });

    const teamIds = teamEspnIdsOf(article)
      .map((espnId) => teamIdByEspnId.get(espnId))
      .filter((id): id is number => id !== undefined);
    if (teamIds.length) {
      await prisma.newsArticleTeam.createMany({
        data: teamIds.map((teamId) => ({ newsArticleId: row.id, teamId })),
      });
    }

    const playerIds = athleteEspnIdsOf(article)
      .map((espnId) => playerIdByEspnId.get(espnId))
      .filter((id): id is number => id !== undefined);
    if (playerIds.length) {
      await prisma.newsArticlePlayer.createMany({
        data: playerIds.map((playerId) => ({ newsArticleId: row.id, playerId })),
      });
    }

    synced += 1;
  }

  console.log(`news synced: ${synced} articles`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
