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
import { computeOpponentFactors, type AllowedStatRow } from "../lib/projections/opponent-factor";
import { computeStdev, combineStdev, isBettable } from "../lib/projections/confidence";
import type { PropStatType } from "../lib/espn/prop-types";

const METHOD = "v1-recency-weighted";
const RECENT_GAMES_WINDOW = 10;

// Stats with a clean team-level "allowed" analog (sum of raw box-score
// categories). DOUBLE_DOUBLE/TRIPLE_DOUBLE are per-player achievement
// flags, not a counting stat a team "allows" in the same sense, so they're
// left out and always get a neutral opponent factor.
const OPPONENT_ADJUSTABLE_STATS: PropStatType[] = [
  "POINTS",
  "REBOUNDS",
  "ASSISTS",
  "THREE_POINTERS_MADE",
  "STEALS",
  "BLOCKS",
  "POINTS_ASSISTS",
  "POINTS_REBOUNDS",
  "REBOUNDS_ASSISTS",
  "POINTS_REBOUNDS_ASSISTS",
];

// How much more/less than league average each team allows per tracked stat,
// derived from already-ingested TeamGameStat rows (what a team "allowed" in
// a game is just what its opponent put up that game) — no new ingest needed.
async function loadOpponentFactors(): Promise<Map<PropStatType, Map<number, number>>> {
  const teamGameStats = await prisma.teamGameStat.findMany({
    where: { game: { status: "FINAL" } },
    select: {
      gameId: true,
      teamId: true,
      points: true,
      rebounds: true,
      assists: true,
      threeMade: true,
      steals: true,
      blocks: true,
    },
  });

  const byGame = new Map<number, typeof teamGameStats>();
  for (const row of teamGameStats) {
    const list = byGame.get(row.gameId);
    if (list) list.push(row);
    else byGame.set(row.gameId, [row]);
  }

  const factorsByStat = new Map<PropStatType, Map<number, number>>();
  for (const statType of OPPONENT_ADJUSTABLE_STATS) {
    const rows: AllowedStatRow[] = [];
    for (const pair of byGame.values()) {
      if (pair.length !== 2) continue; // only count games with both teams' box scores ingested
      const [a, b] = pair;
      const valueA = extractStatValue(statType, { ...a, minutes: null });
      const valueB = extractStatValue(statType, { ...b, minutes: null });
      rows.push({ teamId: a.teamId, allowedValue: valueB });
      rows.push({ teamId: b.teamId, allowedValue: valueA });
    }
    factorsByStat.set(statType, computeOpponentFactors(rows));
  }
  return factorsByStat;
}

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

    const marginStdev = combineStdev(
      computeStdev(home.recentGames.map((g) => g.pointsFor - g.pointsAgainst)),
      computeStdev(away.recentGames.map((g) => g.pointsFor - g.pointsAgainst)),
    );
    const totalStdev = combineStdev(
      computeStdev(home.recentGames.map((g) => g.pointsFor + g.pointsAgainst)),
      computeStdev(away.recentGames.map((g) => g.pointsFor + g.pointsAgainst)),
    );

    const odds = await prisma.odds.findUnique({ where: { gameId: game.id }, select: { spread: true, overUnder: true } });
    // Odds.spread is home-team-relative favorite-negative, same convention
    // the page's impliedSpread() uses — so the home-relative margin the
    // market implies is the negation of it.
    const marketMargin = odds?.spread != null ? -odds.spread : null;
    const marketTotal = odds?.overUnder ?? null;
    const projectedTotal = projection.projectedHomeScore + projection.projectedAwayScore;

    await prisma.gameProjection.create({
      data: {
        gameId: game.id,
        projectedHomeScore: projection.projectedHomeScore,
        projectedAwayScore: projection.projectedAwayScore,
        projectedMargin: projection.projectedMargin,
        marginStdev,
        totalStdev,
        spreadBettable: isBettable(projection.projectedMargin, marketMargin, marginStdev),
        totalBettable: isBettable(projectedTotal, marketTotal, totalStdev),
        marketMarginAtPick: marketMargin,
        marketTotalAtPick: marketTotal,
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
  const opponentFactorsByStat = await loadOpponentFactors();

  const propOddsRows = await prisma.playerPropOdds.findMany({
    // DOUBLE_DOUBLE/TRIPLE_DOUBLE are yes/no propositions — ESPN gives them
    // only an OVER side with odds and no numeric `line` (confirmed: always
    // null). Every projection here is framed as "projected value vs. line",
    // which never produces a lean for these two, so they'd never be shown
    // on the betting page or graded — generating them is pure wasted work.
    // Revisit only alongside a probability-vs-odds comparison built for
    // this market shape specifically.
    where: { game: { status: "SCHEDULED" }, statType: { notIn: ["DOUBLE_DOUBLE", "TRIPLE_DOUBLE"] } },
    select: {
      id: true,
      gameId: true,
      playerId: true,
      statType: true,
      side: true,
      line: true,
      game: { select: { homeTeamId: true, awayTeamId: true } },
      player: { select: { currentTeamId: true } },
    },
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

    const { homeTeamId, awayTeamId } = representative.game;
    const currentTeamId = representative.player.currentTeamId;
    const opponentTeamId =
      currentTeamId === homeTeamId ? awayTeamId : currentTeamId === awayTeamId ? homeTeamId : null;
    const opponentFactor =
      opponentTeamId !== null ? opponentFactorsByStat.get(statType)?.get(opponentTeamId) ?? 1 : 1;

    const projectedValue = projectPlayerStat({ seasonAverage, recentValues, recentMinutes, opponentFactor });
    if (projectedValue === null) continue;

    const stdev = computeStdev(recentValues);
    const bettable = isBettable(projectedValue, representative.line, stdev);

    await prisma.playerPropProjection.create({
      data: {
        gameId: representative.gameId,
        playerId: representative.playerId,
        statType,
        propOddsId: representative.id,
        line: representative.line,
        projectedValue,
        stdev,
        bettable,
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
