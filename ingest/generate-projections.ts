/**
 * Betting insights — projection generation (see
 * openspec/changes/add-betting-insights-page). Computes and freezes our
 * own game-level and player-prop projections for scheduled games, once,
 * before tip-off (design.md "Projections are persisted rows, computed
 * once, frozen pre-game") — never recomputed afterward, so grading never
 * reflects hindsight.
 *
 * Self-healing: only processes games/props that don't already have a
 * frozen projection, so re-running is safe and cheap.
 *
 * Run with: npx tsx ingest/generate-projections.ts
 */
import { prisma } from "./lib/db";
import { projectGame, type TeamProjectionInput, type TeamRecentGame } from "../lib/projections/game-projection";
import { projectPlayerStat } from "../lib/projections/player-prop-projection";
import { extractStatValue, type RawPlayerGameRow } from "../lib/projections/extract-prop-stat";
import type { PropStatType } from "../lib/espn/prop-types";

const METHOD = "v1-recency-weighted";
const RECENT_GAMES_WINDOW = 10;

// How many recent final games a team has played, regardless of season, is
// what the projection cares about — not a strict same-season cutoff, since
// early in a season there may not be 10 games of that season yet.
async function loadTeamProjectionInput(teamId: number, seasonId: number): Promise<TeamProjectionInput> {
  const [seasonStat, recentGameRows] = await Promise.all([
    prisma.teamSeasonStat.findUnique({ where: { teamId_seasonId: { teamId, seasonId } } }),
    prisma.game.findMany({
      where: { status: "FINAL", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      orderBy: { date: "desc" },
      take: RECENT_GAMES_WINDOW,
      select: { homeTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);

  const recentGames: TeamRecentGame[] = recentGameRows
    .filter((g) => g.homeScore !== null && g.awayScore !== null)
    .map((g) => {
      const isHome = g.homeTeamId === teamId;
      return {
        isHome,
        pointsFor: isHome ? g.homeScore! : g.awayScore!,
        pointsAgainst: isHome ? g.awayScore! : g.homeScore!,
      };
    });

  return {
    seasonStat:
      seasonStat?.pointsPerGame != null && seasonStat?.oppPointsPerGame != null
        ? { pointsPerGame: seasonStat.pointsPerGame, oppPointsPerGame: seasonStat.oppPointsPerGame }
        : null,
    recentGames,
  };
}

async function generateGameProjections() {
  const scheduledGames = await prisma.game.findMany({
    where: { status: "SCHEDULED", gameProjection: null },
    select: { id: true, seasonId: true, homeTeamId: true, awayTeamId: true },
  });

  let created = 0;
  for (const game of scheduledGames) {
    const [home, away] = await Promise.all([
      loadTeamProjectionInput(game.homeTeamId, game.seasonId),
      loadTeamProjectionInput(game.awayTeamId, game.seasonId),
    ]);
    const projection = projectGame(home, away);
    if (!projection) continue;

    await prisma.gameProjection.create({
      data: {
        gameId: game.id,
        projectedHomeScore: projection.projectedHomeScore,
        projectedAwayScore: projection.projectedAwayScore,
        projectedMargin: projection.projectedMargin,
        method: METHOD,
      },
    });
    created += 1;
  }
  return { checked: scheduledGames.length, created };
}

// Caches a player's full game-log rows (ordered oldest -> newest, matching
// lib/projections/player-prop-projection.ts's documented order) so
// multiple prop stat types for the same player don't re-query it.
const playerGameLogCache = new Map<number, RawPlayerGameRow[]>();

async function loadPlayerGameLog(playerId: number): Promise<RawPlayerGameRow[]> {
  const cached = playerGameLogCache.get(playerId);
  if (cached) return cached;

  const rows = await prisma.playerGameStat.findMany({
    where: { playerId, points: { not: null }, game: { status: "FINAL" } },
    orderBy: { game: { date: "asc" } },
    select: { points: true, rebounds: true, assists: true, threeMade: true, steals: true, blocks: true, minutes: true },
  });
  playerGameLogCache.set(playerId, rows);
  return rows;
}

async function generatePlayerPropProjections() {
  const propOddsRows = await prisma.playerPropOdds.findMany({
    where: { game: { status: "SCHEDULED" } },
    select: { id: true, gameId: true, playerId: true, statType: true, side: true },
  });
  const existingProjections = await prisma.playerPropProjection.findMany({
    select: { gameId: true, playerId: true, statType: true },
  });
  const existingKeys = new Set(existingProjections.map((p) => `${p.gameId}|${p.playerId}|${p.statType}`));

  const groups = new Map<string, typeof propOddsRows>();
  for (const row of propOddsRows) {
    const key = `${row.gameId}|${row.playerId}|${row.statType}`;
    if (existingKeys.has(key)) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  let created = 0;
  for (const group of groups.values()) {
    const representative = group.find((r) => r.side === "OVER") ?? group[0];
    const statType = representative.statType as PropStatType;
    const gameLog = await loadPlayerGameLog(representative.playerId);
    const values = gameLog.map((row) => extractStatValue(statType, row));
    const minutes = gameLog.map((row) => row.minutes ?? 0);
    const recentValues = values.slice(-RECENT_GAMES_WINDOW);
    const recentMinutes = minutes.slice(-RECENT_GAMES_WINDOW);
    const seasonAverage = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

    const projectedValue = projectPlayerStat({ seasonAverage, recentValues, recentMinutes });
    if (projectedValue === null) continue;

    await prisma.playerPropProjection.create({
      data: {
        gameId: representative.gameId,
        playerId: representative.playerId,
        statType,
        propOddsId: representative.id,
        projectedValue,
        method: METHOD,
      },
    });
    created += 1;
  }
  return { checked: groups.size, created };
}

async function main() {
  const start = Date.now();
  const games = await generateGameProjections();
  const props = await generatePlayerPropProjections();
  console.log(
    `generate-projections done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `games ${games.created}/${games.checked} projected, props ${props.created}/${props.checked} projected ` +
      `(remaining lacked qualifying history and were skipped, not fabricated).`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
