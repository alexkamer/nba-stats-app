/**
 * M5 — season aggregates (PLAN.md Sec 3/M5). Ingests team/player season
 * stats and standings for the 2025-26 regular season (ESPN season year
 * 2026, type 2) — scoped to regular season only (SPEC.md Sec 6): standings
 * only make sense for the regular season, and "season stats" pages
 * conventionally mean regular-season averages.
 *
 * Per the user's earlier decision (not self-aggregating from our own game
 * data), every number here comes from a real ESPN stats/standings call.
 *
 * Run with: npx tsx ingest/sync-aggregates.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints, idFromRef } from "../lib/espn/endpoints";
import {
  conferenceRankOf,
  extractOverallRecord,
  mapStanding,
  type EspnStandingsResponse,
} from "./mappers/standings";
import {
  mapPlayerSeasonStat,
  mapTeamSeasonStat,
  type EspnStatisticsResponse,
} from "./mappers/season-stats";

const SEASON_YEAR = 2026;
const SEASON_TYPE_CODE = "2"; // regular season

async function getOrCreateSeasonId(): Promise<number> {
  const season = await prisma.season.upsert({
    where: { year_type: { year: SEASON_YEAR, type: "REGULAR" } },
    create: { year: SEASON_YEAR, type: "REGULAR" },
    update: {},
  });
  return season.id;
}

async function loadIdMaps() {
  const [teams, conferences] = await Promise.all([
    prisma.team.findMany({ select: { id: true, espnId: true, divisionId: true } }),
    prisma.conference.findMany({ select: { id: true, espnId: true } }),
  ]);
  return {
    teamIdByEspnId: new Map(teams.map((t) => [t.espnId, t.id])),
    divisionIdByTeamEspnId: new Map(teams.map((t) => [t.espnId, t.divisionId])),
    conferenceEspnIds: conferences.map((c) => c.espnId),
  };
}

/** Division rank isn't a field ESPN returns directly (unlike conference
 * rank, which has an explicit `playoffSeed` stat — see conferenceRankOf),
 * and fetching it from the division-level standings endpoint doesn't work
 * either: that endpoint names its record "Division Standings", not
 * "overall" (confirmed during M5 — extractOverallRecord silently returned
 * zeros for everyone there, since the record it looks for doesn't exist
 * at that level). Instead we derive it entirely from data already in hand:
 * the correct overall records fetched at conference level, grouped by each
 * team's division (already known locally from M3), sorted by win pct. This
 * also avoids 6 extra API calls. Approximation, not from an ESPN field —
 * won't necessarily match ESPN's own tiebreaker rules exactly. */
function buildDivisionRankMap(
  allRecords: { teamEspnId: string; record: ReturnType<typeof extractOverallRecord> }[],
  divisionIdByTeamEspnId: Map<string, number | null>,
): Map<string, number> {
  const byDivision = new Map<number, { teamEspnId: string; record: ReturnType<typeof extractOverallRecord> }[]>();
  for (const entry of allRecords) {
    const divisionId = divisionIdByTeamEspnId.get(entry.teamEspnId);
    if (!divisionId) continue;
    const group = byDivision.get(divisionId) ?? [];
    group.push(entry);
    byDivision.set(divisionId, group);
  }

  const rankByTeamEspnId = new Map<string, number>();
  for (const group of byDivision.values()) {
    const ranked = [...group].sort((a, b) => {
      const winPctA = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
      const winPctB = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
      return winPctB - winPctA || b.record.wins - a.record.wins;
    });
    ranked.forEach(({ teamEspnId }, index) => rankByTeamEspnId.set(teamEspnId, index + 1));
  }
  return rankByTeamEspnId;
}

async function syncStandingsAndTeamSeasonStats(seasonId: number) {
  const maps = await loadIdMaps();

  // Fetch both conferences first so we have every team's correct overall
  // record in hand before computing division rank.
  const conferenceViews = await Promise.all(
    maps.conferenceEspnIds.map((confEspnId) =>
      fetchEspnJson<EspnStandingsResponse>(
        espnEndpoints.standingsView(String(SEASON_YEAR), SEASON_TYPE_CODE, confEspnId, "0"),
      ),
    ),
  );
  const allEntries = conferenceViews.flatMap((view) => view.standings);
  const allRecords = allEntries.map((entry) => ({
    teamEspnId: idFromRef(entry.team.$ref),
    record: extractOverallRecord(entry),
  }));
  const divisionRankByTeamEspnId = buildDivisionRankMap(allRecords, maps.divisionIdByTeamEspnId);

  let standingsCount = 0;
  let teamStatsCount = 0;

  await Promise.all(
    allEntries.map(async (entry) => {
      const teamEspnId = idFromRef(entry.team.$ref);
      const teamId = maps.teamIdByEspnId.get(teamEspnId);
      if (!teamId) {
        console.warn(`standings: unknown team espnId ${teamEspnId}`);
        return;
      }

      const conferenceRank = conferenceRankOf(entry);
      const divisionRank = divisionRankByTeamEspnId.get(teamEspnId) ?? null;
      const standingInput = mapStanding(entry, teamId, seasonId, conferenceRank, divisionRank);
      await prisma.standing.upsert({
        where: { teamId_seasonId: { teamId, seasonId } },
        create: standingInput,
        update: standingInput,
      });
      standingsCount += 1;

      const overall = extractOverallRecord(entry);
      const teamStats = await fetchEspnJson<EspnStatisticsResponse>(
        espnEndpoints.teamStatistics(String(SEASON_YEAR), SEASON_TYPE_CODE, teamEspnId),
      );
      const teamStatInput = mapTeamSeasonStat(teamStats, teamId, seasonId, overall);
      await prisma.teamSeasonStat.upsert({
        where: { teamId_seasonId: { teamId, seasonId } },
        create: teamStatInput,
        update: teamStatInput,
      });
      teamStatsCount += 1;
    }),
  );

  console.log(`standings synced: ${standingsCount}, team season stats synced: ${teamStatsCount}`);
}

async function syncPlayerSeasonStats(seasonId: number) {
  const players = await prisma.player.findMany({
    select: { id: true, espnId: true, currentTeamId: true },
  });

  let synced = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    players.map(async (player) => {
      if (!player.currentTeamId) {
        skipped += 1;
        return;
      }
      let stats: EspnStatisticsResponse;
      try {
        stats = await fetchEspnJson<EspnStatisticsResponse>(
          espnEndpoints.athleteStatistics(String(SEASON_YEAR), SEASON_TYPE_CODE, player.espnId),
        );
      } catch {
        // Player didn't play this season/type (e.g. no regular-season
        // minutes) — ESPN 404s rather than returning an empty payload.
        skipped += 1;
        return;
      }
      const input = mapPlayerSeasonStat(stats, player.id, player.currentTeamId, seasonId);
      await prisma.playerSeasonStat.upsert({
        where: { playerId_seasonId: { playerId: player.id, seasonId } },
        create: input,
        update: input,
      });
      synced += 1;
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");
  failures.forEach((f, i) => {
    if (f.status === "rejected") console.error(`player season stat failure ${i + 1}:`, f.reason);
  });
  console.log(`player season stats synced: ${synced}, skipped (no data): ${skipped}, failed: ${failures.length}`);
}

async function main() {
  const seasonId = await getOrCreateSeasonId();
  await syncStandingsAndTeamSeasonStats(seasonId);
  await syncPlayerSeasonStats(seasonId);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
