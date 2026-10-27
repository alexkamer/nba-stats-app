/**
 * Shared discover-and-ingest logic used by both `backfill.ts` (full season,
 * one-shot) and `sync-completed-games.ts` (recent days, recurring — M6).
 * Extracted from the original M4 backfill script.
 *
 * Phase A walks the scoreboard for a given list of dates (one call = every
 * game that day) to discover+create Game rows. Phase B fetches `summary`
 * per game needing a box score — determined by a DB query, not "discovered
 * this run", so a previous partial failure always self-heals (see PLAN.md
 * Sec 3/M4's resilience note).
 */
import { prisma } from "./db";
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";
import {
  isIngestableFinalGame,
  mapGame,
  mapVenueFromEvent,
  type EspnScoreboardEvent,
} from "../mappers/game";
import { mapPlayerGameStat, mapTeamGameStat, type EspnBoxscore } from "../mappers/boxscore";
import { mapPlay, type EspnPlay } from "../mappers/playbyplay";

interface EspnScoreboardResponse {
  events: EspnScoreboardEvent[];
}

interface EspnSummaryResponse {
  boxscore: EspnBoxscore;
  plays: EspnPlay[];
}

export function* dateRange(start: Date, end: Date): Generator<string> {
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

export async function discoverGames(dateStrings: Iterable<string>) {
  const maps = await loadExistingIdMaps();
  const seasonCache = new Map<string, number>();

  // Fetch all scoreboards concurrently (network-bound, embarrassingly
  // parallel — each day is independent) before doing any DB writes. Across
  // many seasons this is the difference between walking ~6,000 days
  // sequentially (tens of minutes) and letting the shared concurrency
  // limiter (lib/espn/rate-limiter.ts) pipeline them. DB writes stay
  // sequential below so the venue/season caches can't race.
  const dates = [...dateStrings];
  const boards = await Promise.all(
    dates.map((dateStr) => fetchEspnJson<EspnScoreboardResponse>(espnEndpoints.scoreboard(dateStr))),
  );

  let discovered = 0;
  let skippedExisting = 0;

  for (const board of boards) {
    for (const event of board.events ?? []) {
      if (!isIngestableFinalGame(event)) continue;
      if (maps.existingGameEspnIds.has(event.id)) {
        skippedExisting += 1;
        continue;
      }

      const competition = event.competitions?.[0];
      if (!competition) {
        console.warn(`skipping event ${event.id}: malformed (no competitions array)`);
        continue;
      }
      const homeEspnId = competition.competitors?.find((c) => c.homeAway === "home")?.team.id;
      const awayEspnId = competition.competitors?.find((c) => c.homeAway === "away")?.team.id;
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
      discovered += 1;
    }
  }

  console.log(
    `discoverGames: ${dates.length} days walked, ${discovered} new games discovered, ` +
      `${skippedExisting} already in DB (skipped).`,
  );
  return { maps, discovered };
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
  // the Game row we already wrote in discoverGames rather than re-deriving it.
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });

  const teamGameStatInputs = boxscore.teams
    .map((teamBox) => {
      const teamId = teamIdByEspnId.get(teamBox.team.id);
      if (!teamId) return null;
      const points = teamId === game.homeTeamId ? game.homeScore : teamId === game.awayTeamId ? game.awayScore : null;
      return mapTeamGameStat(teamBox, gameId, teamId, points);
    })
    .filter((x) => x !== null);

  // Player box score lines — create a minimal Player row on the fly for
  // anyone not already known (e.g. traded since the last roster sync, or —
  // for historical seasons — a player who has since retired and was never
  // on any roster snapshot we've taken). Player upserts happen individually
  // here (idempotent, rare after the first pass through an era); the bulk
  // stat rows below are batched.
  const playerGameStatInputs: ReturnType<typeof mapPlayerGameStat>[] = [];
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

      playerGameStatInputs.push(mapPlayerGameStat(entry, keys, gameId, playerId, teamId));
    }
  }

  const playInputs = plays.map((play) => {
    const teamId = play.team ? teamIdByEspnId.get(play.team.id) ?? null : null;
    return mapPlay(play, gameId, teamId);
  });

  // One atomic transaction per game: either all of its box score/play rows
  // land, or none do. This matters for the self-healing retry design (PLAN.md
  // Sec 3/M4) — the "needs processing" check is "zero team_game_stat rows for
  // this game," so a crash mid-write must never leave a game half-written
  // with team rows present but player/play rows missing, or it would look
  // "done" to a future run and never get retried. Batched createMany (not
  // per-row upsert) also matters at historical-backfill scale: dozens of
  // seasons' worth of games would otherwise spend most of their time on
  // write-call overhead rather than ESPN latency (confirmed during the
  // single-season M4 backfill, where writes dominated over network time).
  await prisma.$transaction([
    prisma.teamGameStat.createMany({ data: teamGameStatInputs }),
    prisma.playerGameStat.createMany({ data: playerGameStatInputs }),
    prisma.play.createMany({ data: playInputs }),
  ]);
}

export async function ingestMissingBoxscores(maps: Awaited<ReturnType<typeof loadExistingIdMaps>>) {
  // Self-healing: query for games missing a box score rather than trusting
  // "discovered this run" — a game with zero team_game_stat rows was never
  // fully processed, regardless of which run discovered it.
  const gamesNeedingBoxscore = await prisma.game.findMany({
    where: { teamGameStats: { none: {} } },
    select: { id: true, espnId: true },
  });

  let done = 0;
  // allSettled, not all: one bad game's box score must not abort the other
  // in-flight games (SPEC.md Sec 8 — skip and log, don't crash the job).
  const results = await Promise.allSettled(
    gamesNeedingBoxscore.map(async ({ id, espnId }) => {
      await ingestOneGame(id, espnId, maps.teamIdByEspnId, maps.playerIdByEspnId, maps.positionIdByName);
      done += 1;
      if (done % 100 === 0) console.log(`ingestMissingBoxscores progress: ${done}/${gamesNeedingBoxscore.length}`);
    }),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failures.forEach((f, i) => console.error(`box score ingest failure ${i + 1}/${failures.length}:`, f.reason));
  console.log(
    `ingestMissingBoxscores done: ${done}/${gamesNeedingBoxscore.length} games fully ingested ` +
      `(box score + play-by-play), ${failures.length} failed — re-run to retry just those.`,
  );
  return { done, total: gamesNeedingBoxscore.length, failed: failures.length };
}
