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

  let dayCount = 0;
  let discovered = 0;
  let skippedExisting = 0;

  for (const dateStr of dateStrings) {
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
      discovered += 1;
    }
  }

  console.log(
    `discoverGames: ${dayCount} days walked, ${discovered} new games discovered, ` +
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
  // anyone not already known (e.g. traded since the last roster sync).
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
