/**
 * M5 — season aggregates (PLAN.md Sec 3/M5). Ingests team/player season
 * stats and standings for a regular season — scoped to regular season only
 * (SPEC.md Sec 6): standings only make sense for the regular season, and
 * "season stats" pages conventionally mean regular-season averages.
 *
 * Per the user's earlier decision (not self-aggregating from our own game
 * data), every number here comes from a real ESPN stats/standings call.
 *
 * Run with: npx tsx ingest/sync-aggregates.ts [year]
 * (defaults to 2026 — the recurring M6 cron case; pass a year for
 * historical backfill, or use backfill-aggregates-historical.ts for a range)
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints, idFromRef } from "../lib/espn/endpoints";
import {
  conferenceRankOf,
  extractOverallRecord,
  mapDivisionStanding,
  mapExpandedStanding,
  mapNbaCupStanding,
  mapStanding,
  type EspnStandingsResponse,
} from "./mappers/standings";
import {
  mapPlayerSeasonStat,
  mapTeamSeasonStat,
  type EspnStatisticsResponse,
} from "./mappers/season-stats";

const SEASON_TYPE_CODE = "2"; // regular season

// NBA Cup (In-Season Tournament) started in the 2023-24 season (year 2024
// in our convention) — don't bother querying ESPN's pool groups for
// earlier seasons, they don't exist. Pool group espnIds confirmed stable
// across 2024-2027 by direct probing (see mappers/standings.ts).
const NBA_CUP_START_YEAR = 2024;
const NBA_CUP_GROUPS = [
  { espnId: "22", groupName: "East Group A" },
  { espnId: "23", groupName: "East Group B" },
  { espnId: "24", groupName: "East Group C" },
  { espnId: "25", groupName: "West Group A" },
  { espnId: "26", groupName: "West Group B" },
  { espnId: "27", groupName: "West Group C" },
];

async function getOrCreateSeasonId(seasonYear: number): Promise<number> {
  const season = await prisma.season.upsert({
    where: { year_type: { year: seasonYear, type: "REGULAR" } },
    create: { year: seasonYear, type: "REGULAR" },
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

async function syncStandingsAndTeamSeasonStats(seasonId: number, seasonYear: number) {
  const maps = await loadIdMaps();

  // Fetch both conferences first so we have every team's correct overall
  // record in hand before computing division rank.
  const [conferenceViews, expandedViews, divisionViews] = await Promise.all([
    Promise.all(
      maps.conferenceEspnIds.map((confEspnId) =>
        fetchEspnJson<EspnStandingsResponse>(
          espnEndpoints.standingsView(String(seasonYear), SEASON_TYPE_CODE, confEspnId, "0"),
        ),
      ),
    ),
    Promise.all(
      maps.conferenceEspnIds.map((confEspnId) =>
        fetchEspnJson<EspnStandingsResponse>(
          espnEndpoints.standingsView(String(seasonYear), SEASON_TYPE_CODE, confEspnId, "1"),
        ),
      ),
    ),
    Promise.all(
      maps.conferenceEspnIds.map((confEspnId) =>
        fetchEspnJson<EspnStandingsResponse>(
          espnEndpoints.standingsView(String(seasonYear), SEASON_TYPE_CODE, confEspnId, "2"),
        ),
      ),
    ),
  ]);
  const allEntries = conferenceViews.flatMap((view) => view.standings);
  const expandedByTeamEspnId = new Map(
    expandedViews
      .flatMap((view) => view.standings)
      .map((entry) => [idFromRef(entry.team.$ref), mapExpandedStanding(entry)]),
  );
  const divisionByTeamEspnId = new Map(
    divisionViews
      .flatMap((view) => view.standings)
      .map((entry) => [idFromRef(entry.team.$ref), mapDivisionStanding(entry)]),
  );
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
      const standingInput = {
        ...mapStanding(entry, teamId, seasonId, conferenceRank, divisionRank),
        ...(expandedByTeamEspnId.get(teamEspnId) ?? {}),
        ...(divisionByTeamEspnId.get(teamEspnId) ?? {}),
      };
      await prisma.standing.upsert({
        where: { teamId_seasonId: { teamId, seasonId } },
        create: standingInput,
        update: standingInput,
      });
      standingsCount += 1;

      const overall = extractOverallRecord(entry);
      const teamStats = await fetchEspnJson<EspnStatisticsResponse>(
        espnEndpoints.teamStatistics(String(seasonYear), SEASON_TYPE_CODE, teamEspnId),
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

async function syncNbaCupStandings(seasonId: number, seasonYear: number) {
  if (seasonYear < NBA_CUP_START_YEAR) return;

  const maps = await loadIdMaps();
  const groupViews = await Promise.all(
    NBA_CUP_GROUPS.map((group) =>
      fetchEspnJson<EspnStandingsResponse>(
        espnEndpoints.standingsView(String(seasonYear), SEASON_TYPE_CODE, group.espnId, "3"),
      ),
    ),
  );

  let nbaCupCount = 0;
  await Promise.all(
    groupViews.map(async (view, i) => {
      const groupName = NBA_CUP_GROUPS[i].groupName;
      await Promise.all(
        view.standings.map(async (entry) => {
          const teamEspnId = idFromRef(entry.team.$ref);
          const teamId = maps.teamIdByEspnId.get(teamEspnId);
          if (!teamId) {
            console.warn(`nba cup standings: unknown team espnId ${teamEspnId}`);
            return;
          }
          const input = { teamId, seasonId, groupName, ...mapNbaCupStanding(entry) };
          await prisma.nbaCupStanding.upsert({
            where: { teamId_seasonId: { teamId, seasonId } },
            create: input,
            update: input,
          });
          nbaCupCount += 1;
        }),
      );
    }),
  );
  console.log(`nba cup standings synced: ${nbaCupCount}`);
}

/**
 * Which team a player should be attributed to for a season's stats.
 * `player.currentTeamId` is wrong for historical seasons — it's their
 * *modern* team, not who they played for back then (confirmed as a real
 * bug before this ran at historical scale). Instead, derive it from our
 * own ingested box scores: whichever team they have the most
 * player_game_stat rows for in this season (handles mid-season trades by
 * picking the team they played the most games for). This also naturally
 * scopes the player list to "people who actually played this season,"
 * not every player ever in the DB.
 */
async function teamIdByPlayerForSeason(seasonId: number): Promise<Map<number, number>> {
  const grouped = await prisma.playerGameStat.groupBy({
    by: ["playerId", "teamId"],
    where: { game: { seasonId } },
    _count: { _all: true },
  });

  const bestByPlayer = new Map<number, { teamId: number; count: number }>();
  for (const row of grouped) {
    const current = bestByPlayer.get(row.playerId);
    if (!current || row._count._all > current.count) {
      bestByPlayer.set(row.playerId, { teamId: row.teamId, count: row._count._all });
    }
  }
  return new Map([...bestByPlayer].map(([playerId, { teamId }]) => [playerId, teamId]));
}

async function syncPlayerSeasonStats(seasonId: number, seasonYear: number) {
  const teamIdByPlayer = await teamIdByPlayerForSeason(seasonId);
  const players = await prisma.player.findMany({
    where: { id: { in: [...teamIdByPlayer.keys()] } },
    select: { id: true, espnId: true },
  });

  let synced = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    players.map(async (player) => {
      const teamId = teamIdByPlayer.get(player.id)!;
      let stats: EspnStatisticsResponse;
      try {
        stats = await fetchEspnJson<EspnStatisticsResponse>(
          espnEndpoints.athleteStatistics(String(seasonYear), SEASON_TYPE_CODE, player.espnId),
        );
      } catch {
        // Player didn't play this season/type (e.g. no regular-season
        // minutes) — ESPN 404s rather than returning an empty payload.
        skipped += 1;
        return;
      }
      const input = mapPlayerSeasonStat(stats, player.id, teamId, seasonId);
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

export async function syncAggregatesForYear(seasonYear: number) {
  console.log(`\n--- aggregates for season year ${seasonYear} ---`);
  const seasonId = await getOrCreateSeasonId(seasonYear);
  await syncStandingsAndTeamSeasonStats(seasonId, seasonYear);
  await syncNbaCupStandings(seasonId, seasonYear);
  await syncPlayerSeasonStats(seasonId, seasonYear);
}

/** No-arg default for the recurring M6 cron case: whatever the most recent
 * season we know about is, per the Season table itself (populated by
 * discoverGames the moment a season's first game goes final) — not a
 * hardcoded year, which would silently go stale every October when a new
 * season starts (confirmed as a real bug: the old hardcoded 2026 default
 * meant run-all-sync.ts would never pick up 2026-27 on its own). */
async function currentSeasonYear(): Promise<number> {
  const latest = await prisma.season.findFirst({
    where: { type: "REGULAR" },
    orderBy: { year: "desc" },
  });
  if (!latest) throw new Error("No seasons in the database yet — run backfill first");
  return latest.year;
}

async function main() {
  const seasonYear = process.argv[2] ? Number(process.argv[2]) : await currentSeasonYear();
  await syncAggregatesForYear(seasonYear);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
