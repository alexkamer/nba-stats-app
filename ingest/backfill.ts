/**
 * M4 — backfill of completed games for one season (PLAN.md Sec 3/M4).
 * Scope per SPEC.md Sec 9.5: only games that are `final` are ever written;
 * preseason is excluded (Sec 9.7 — season_type is preseason/regular/postseason
 * only). Season/date range chosen with the user: 2025-26 (ESPN season year
 * 2026), the most recently completed season as of 2026-10-26.
 *
 * Phase A walks the scoreboard day-by-day (one call = every game that day)
 * to discover+create Game rows. Phase B fetches `summary` per new game
 * (box score + play-by-play) concurrently through the shared rate-limited
 * client. Re-running is safe: both phases upsert by espnId and Phase A
 * skips games already in the DB before Phase B ever sees them.
 *
 * Run with: npx tsx ingest/backfill.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import {
  isIngestableFinalGame,
  mapGame,
  mapVenueFromEvent,
  type EspnScoreboardEvent,
} from "./mappers/game";
import { mapPlayerGameStat, mapTeamGameStat, type EspnBoxscore } from "./mappers/boxscore";
import { mapPlay, type EspnPlay } from "./mappers/playbyplay";

const SEASON_START = new Date("2025-10-21T00:00:00Z");
const SEASON_END = new Date("2026-06-10T00:00:00Z");

interface EspnScoreboardResponse {
  events: EspnScoreboardEvent[];
}

interface EspnSummaryResponse {
  boxscore: EspnBoxscore;
  plays: EspnPlay[];
}

function* dateRange(start: Date, end: Date): Generator<string> {
  const d = new Date(start);
  while (d <= end) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    yield `${y}${m}${day}`;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

async function loadExistingIdMaps() {
  const [teams, venues, players, positions, existingGames] = await Promise.all([
    prisma.team.findMany({ select: { id: true, espnId: true } }),
    prisma.venue.findMany({ select: { id: true, espnId: true } }),
    prisma.player.findMany({ select: { id: true, espnId: true } }),
    prisma.position.findMany({ select: { id: true, name: true } }),
    prisma.game.findMany({ select: { espnId: true } }),
  ]);

  return {
    teamIdByEspnId: new Map(teams.map((t) => [t.espnId, t.id])),
    venueIdByEspnId: new Map(venues.map((v) => [v.espnId, v.id])),
    playerIdByEspnId: new Map(players.map((p) => [p.espnId, p.id])),
    positionIdByName: new Map(positions.map((p) => [p.name, p.id])),
    existingGameEspnIds: new Set(existingGames.map((g) => g.espnId)),
  };
}

async function upsertSeason(
  year: number,
  type: "REGULAR" | "POSTSEASON",
  cache: Map<string, number>,
): Promise<number> {
  const key = `${year}-${type}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const season = await prisma.season.upsert({
    where: { year_type: { year, type } },
    create: { year, type },
    update: {},
  });
  cache.set(key, season.id);
  return season.id;
}

async function phaseA_discoverGames() {
  const maps = await loadExistingIdMaps();
  const seasonCache = new Map<string, number>();
  const newGameIds: { id: number; espnId: string }[] = [];

  let dayCount = 0;
  let discovered = 0;
  let skippedExisting = 0;

  for (const dateStr of dateRange(SEASON_START, SEASON_END)) {
    dayCount += 1;
    const board = await fetchEspnJson<EspnScoreboardResponse>(espnEndpoints.scoreboard(dateStr));

    for (const event of board.events ?? []) {
      if (!isIngestableFinalGame(event)) continue;
      if (maps.existingGameEspnIds.has(event.id)) {
        skippedExisting += 1;
        continue;
      }

      const competition = event.competitions[0];
      const homeEspnId = competition.competitors.find((c) => c.homeAway === "home")?.team.id;
      const awayEspnId = competition.competitors.find((c) => c.homeAway === "away")?.team.id;
      const homeTeamId = homeEspnId ? maps.teamIdByEspnId.get(homeEspnId) : undefined;
      const awayTeamId = awayEspnId ? maps.teamIdByEspnId.get(awayEspnId) : undefined;
      if (!homeTeamId || !awayTeamId) {
        console.warn(`skipping event ${event.id}: unknown team (home=${homeEspnId}, away=${awayEspnId})`);
        continue;
      }

      let venueId: number | null = null;
      const venueInput = mapVenueFromEvent(competition.venue);
      if (venueInput) {
        venueId = maps.venueIdByEspnId.get(venueInput.espnId) ?? null;
        if (!venueId) {
          const venue = await prisma.venue.upsert({
            where: { espnId: venueInput.espnId },
            create: venueInput,
            update: venueInput,
          });
          venueId = venue.id;
          maps.venueIdByEspnId.set(venueInput.espnId, venueId);
        }
      }

      const seasonType = event.season!.type === 3 ? "POSTSEASON" : "REGULAR";
      const seasonId = await upsertSeason(event.season!.year, seasonType, seasonCache);

      const gameInput = mapGame(event, homeTeamId, awayTeamId, venueId, seasonId);
      const game = await prisma.game.upsert({
        where: { espnId: gameInput.espnId },
        create: gameInput,
        update: gameInput,
      });
      maps.existingGameEspnIds.add(game.espnId);
      newGameIds.push({ id: game.id, espnId: game.espnId });
      discovered += 1;
    }
  }

  console.log(
    `Phase A done: ${dayCount} days walked, ${discovered} new games discovered, ` +
      `${skippedExisting} already in DB (skipped).`,
  );
  return { newGameIds, maps };
}

async function ingestOneGame(
  gameId: number,
  eventEspnId: string,
  teamIdByEspnId: Map<string, number>,
  playerIdByEspnId: Map<string, number>,
  positionIdByName: Map<string, number>,
) {
  const summary = await fetchEspnJson<EspnSummaryResponse>(espnEndpoints.summary(eventEspnId));
  const { boxscore, plays } = summary;

  // Team box score lines. Need each team's final score; pull it back off
  // the Game row we already wrote in Phase A rather than re-deriving it.
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });

  for (const teamBox of boxscore.teams) {
    const teamId = teamIdByEspnId.get(teamBox.team.id);
    if (!teamId) continue;
    const points = teamId === game.homeTeamId ? game.homeScore : teamId === game.awayTeamId ? game.awayScore : null;
    const input = mapTeamGameStat(teamBox, gameId, teamId, points);
    await prisma.teamGameStat.upsert({
      where: { gameId_teamId: { gameId, teamId } },
      create: input,
      update: input,
    });
  }

  // Player box score lines — create a minimal Player row on the fly for
  // anyone not already known (e.g. traded since the M3 roster snapshot).
  for (const playerGroup of boxscore.players) {
    const teamId = teamIdByEspnId.get(playerGroup.team.id);
    if (!teamId) continue;
    const keys = playerGroup.statistics[0]?.keys ?? [];
    const athletes = playerGroup.statistics[0]?.athletes ?? [];

    for (const entry of athletes) {
      if (!entry.athlete?.id) {
        console.warn(`game ${eventEspnId}: skipping a player box score entry with no athlete.id`);
        continue;
      }
      let playerId = playerIdByEspnId.get(entry.athlete.id);
      if (!playerId) {
        const positionId = entry.athlete.position
          ? positionIdByName.get(entry.athlete.position.name) ?? null
          : null;
        const player = await prisma.player.upsert({
          where: { espnId: entry.athlete.id },
          create: {
            espnId: entry.athlete.id,
            fullName: entry.athlete.displayName,
            displayName: entry.athlete.displayName,
            headshotUrl: entry.athlete.headshot?.href ?? null,
            jersey: entry.athlete.jersey ?? null,
            positionId,
            currentTeamId: teamId,
            active: true,
          },
          update: {},
        });
        playerId = player.id;
        playerIdByEspnId.set(entry.athlete.id, playerId);
      }

      const input = mapPlayerGameStat(entry, keys, gameId, playerId, teamId);
      await prisma.playerGameStat.upsert({
        where: { gameId_playerId: { gameId, playerId } },
        create: input,
        update: input,
      });
    }
  }

  // Play-by-play.
  for (const play of plays) {
    const teamId = play.team ? teamIdByEspnId.get(play.team.id) ?? null : null;
    const input = mapPlay(play, gameId, teamId);
    await prisma.play.upsert({
      where: { espnId: input.espnId },
      create: input,
      update: input,
    });
  }
}

async function phaseB_ingestBoxscoresAndPlays(
  gamesNeedingBoxscore: { id: number; espnId: string }[],
  maps: Awaited<ReturnType<typeof loadExistingIdMaps>>,
) {
  let done = 0;
  // allSettled, not all: one bad game's box score must not abort the other
  // ~1,200 in-flight games (SPEC.md Sec 8 — skip and log, don't crash the job).
  const results = await Promise.allSettled(
    gamesNeedingBoxscore.map(async ({ id, espnId }) => {
      await ingestOneGame(id, espnId, maps.teamIdByEspnId, maps.playerIdByEspnId, maps.positionIdByName);
      done += 1;
      if (done % 100 === 0) console.log(`Phase B progress: ${done}/${gamesNeedingBoxscore.length}`);
    }),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failures.forEach((f, i) => console.error(`Phase B failure ${i + 1}/${failures.length}:`, f.reason));
  console.log(
    `Phase B done: ${done}/${gamesNeedingBoxscore.length} games fully ingested ` +
      `(box score + play-by-play), ${failures.length} failed — re-run to retry just those.`,
  );
}

async function main() {
  const start = Date.now();
  const { maps } = await phaseA_discoverGames();

  // Self-healing: don't just use this run's newly-discovered games — also
  // pick up any existing game that never got its box score ingested (e.g.
  // a previous run's Phase B failed partway through). A game with zero
  // team_game_stat rows was never fully processed.
  const gamesNeedingBoxscore = await prisma.game.findMany({
    where: { teamGameStats: { none: {} } },
    select: { id: true, espnId: true },
  });

  await phaseB_ingestBoxscoresAndPlays(gamesNeedingBoxscore, maps);
  console.log(`Backfill complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
