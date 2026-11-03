/**
 * Team performance vs. expectation (see
 * openspec/changes/add-team-performance-vs-expectation). For every FINAL
 * regular-season game with a recorded spread and no performance rows yet,
 * computes each team's expected / actual / cover margin and label
 * (lib/accuracy/grade-performance.ts) plus reason tags
 * (lib/accuracy/performance-tags.ts), and persists one
 * `TeamGamePerformance` row per team with its `TeamGamePerformanceTag`s.
 *
 * Idempotent: games that already have rows are skipped, and rows are only
 * ever inserted (both teams' rows plus tags in one transaction), so re-runs
 * never duplicate or alter existing results. The `(gameId, teamId)` unique
 * constraint is the backstop.
 *
 * Run with: npx tsx ingest/compute-team-game-performance.ts
 */
import { prisma } from "./lib/db";
import { computeMargins, labelFor, favoriteFlag } from "../lib/accuracy/grade-performance";
import { deriveTags, STAR_COUNT, type TimelinePoint } from "../lib/accuracy/performance-tags";

/** Games whose plays are loaded per query — keeps each `Play` read bounded
 * while avoiding one query per game across a multi-season backfill. */
const BATCH_SIZE = 100;
/** Minimum earlier-season games before a team's season FG% is trusted for the hot/cold shooting tags. */
const MIN_GAMES_FOR_SEASON_FG = 10;

interface CandidateGame {
  id: number;
  date: Date;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  spread: number;
}

interface TeamFg {
  made: number;
  att: number;
}

interface SeasonFgLookup {
  /** This game's own FG for the team, or null when unavailable. */
  gameFg: TeamFg | null;
  /** The team's cumulative FG over its earlier games that season, with the game count. */
  priorFg: (TeamFg & { games: number }) | null;
}

async function loadCandidates(): Promise<CandidateGame[]> {
  const games = await prisma.game.findMany({
    where: {
      status: "FINAL",
      seasonType: "REGULAR",
      odds: { is: { spread: { not: null } } },
      teamPerformances: { none: {} },
    },
    select: {
      id: true,
      date: true,
      seasonId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      odds: { select: { spread: true } },
    },
    orderBy: { date: "asc" },
  });

  const out: CandidateGame[] = [];
  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null || g.odds?.spread == null) continue;
    out.push({
      id: g.id,
      date: g.date,
      seasonId: g.seasonId,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      spread: g.odds.spread,
    });
  }
  return out;
}

/** Builds a `gameId:teamId` -> FG lookup (this game's FG plus the team's
 * cumulative FG over *earlier* games that season — never including the game
 * itself, so a game is compared with the team's prior form, not its own). */
async function loadFgLookup(seasonIds: number[]): Promise<Map<string, SeasonFgLookup>> {
  const rows = await prisma.teamGameStat.findMany({
    where: { game: { seasonId: { in: seasonIds }, status: "FINAL", seasonType: "REGULAR" } },
    select: { gameId: true, teamId: true, fgMade: true, fgAtt: true, game: { select: { date: true, seasonId: true } } },
  });

  const byTeamSeason = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.teamId}:${row.game.seasonId}`;
    const list = byTeamSeason.get(key) ?? [];
    list.push(row);
    byTeamSeason.set(key, list);
  }

  const lookup = new Map<string, SeasonFgLookup>();
  for (const list of byTeamSeason.values()) {
    list.sort((a, b) => a.game.date.getTime() - b.game.date.getTime());
    let made = 0;
    let att = 0;
    let games = 0;
    for (const row of list) {
      const hasFg = row.fgMade !== null && row.fgAtt !== null && row.fgAtt > 0;
      lookup.set(`${row.gameId}:${row.teamId}`, {
        gameFg: hasFg ? { made: row.fgMade!, att: row.fgAtt! } : null,
        priorFg: games >= MIN_GAMES_FOR_SEASON_FG && att > 0 ? { made, att, games } : null,
      });
      if (hasFg) {
        made += row.fgMade!;
        att += row.fgAtt!;
        games += 1;
      }
    }
  }
  return lookup;
}

/** The team's top players by minutes over its earlier games that season. */
async function topPlayersByMinutes(teamId: number, seasonId: number, before: Date): Promise<number[]> {
  const grouped = await prisma.playerGameStat.groupBy({
    by: ["playerId"],
    where: { teamId, minutes: { not: null }, game: { seasonId, seasonType: "REGULAR", status: "FINAL", date: { lt: before } } },
    _sum: { minutes: true },
  });
  return grouped
    .sort((a, b) => (b._sum.minutes ?? 0) - (a._sum.minutes ?? 0))
    .slice(0, STAR_COUNT)
    .map((g) => g.playerId);
}

/** Whether one of the team's star players was listed OUT for this game, or
 * null when the game has no availability snapshot at all (unknown). */
async function starOutFor(game: CandidateGame, teamId: number, availability: { playerId: number; status: string }[]): Promise<boolean | null> {
  if (availability.length === 0) return null;
  const outIds = new Set(availability.filter((a) => a.status === "OUT").map((a) => a.playerId));
  if (outIds.size === 0) return false;
  const stars = await topPlayersByMinutes(teamId, game.seasonId, game.date);
  return stars.some((id) => outIds.has(id));
}

function buildTimeline(
  plays: { period: number | null; homeScore: number | null; awayScore: number | null }[],
  isHome: boolean,
): TimelinePoint[] | null {
  const points: TimelinePoint[] = [];
  for (const p of plays) {
    if (p.period === null || p.homeScore === null || p.awayScore === null) continue;
    const diff = p.homeScore - p.awayScore;
    points.push({ period: p.period, margin: isHome ? diff : -diff });
  }
  return points.length > 0 ? points : null;
}

function fgPct(fg: TeamFg | null): number | null {
  return fg && fg.att > 0 ? fg.made / fg.att : null;
}

async function processBatch(batch: CandidateGame[], fgLookup: Map<string, SeasonFgLookup>): Promise<number> {
  const gameIds = batch.map((g) => g.id);

  const [plays, availabilityRows] = await Promise.all([
    prisma.play.findMany({
      where: { gameId: { in: gameIds } },
      select: { gameId: true, period: true, homeScore: true, awayScore: true },
      orderBy: [{ gameId: "asc" }, { sequenceNumber: "asc" }],
    }),
    prisma.playerAvailability.findMany({
      where: { gameId: { in: gameIds } },
      select: { gameId: true, playerId: true, status: true },
    }),
  ]);

  const playsByGame = new Map<number, typeof plays>();
  for (const p of plays) {
    const list = playsByGame.get(p.gameId) ?? [];
    list.push(p);
    playsByGame.set(p.gameId, list);
  }
  const availabilityByGame = new Map<number, typeof availabilityRows>();
  for (const a of availabilityRows) {
    const list = availabilityByGame.get(a.gameId) ?? [];
    list.push(a);
    availabilityByGame.set(a.gameId, list);
  }

  let created = 0;
  for (const game of batch) {
    const margins = computeMargins(game.spread, game.homeScore, game.awayScore);
    const gamePlays = playsByGame.get(game.id) ?? [];
    const availability = availabilityByGame.get(game.id) ?? [];

    const sides = [
      { teamId: game.homeTeamId, opponentTeamId: game.awayTeamId, isHome: true, m: margins.home, spread: game.spread },
      { teamId: game.awayTeamId, opponentTeamId: game.homeTeamId, isHome: false, m: margins.away, spread: game.spread === 0 ? 0 : -game.spread },
    ];

    const writes = [];
    for (const side of sides) {
      const fg = fgLookup.get(`${game.id}:${side.teamId}`);
      const tags = deriveTags({
        timeline: buildTimeline(gamePlays, side.isHome),
        expectedMargin: side.m.expectedMargin,
        finalMargin: side.m.actualMargin,
        starOut: await starOutFor(game, side.teamId, availability),
        gameFgPct: fgPct(fg?.gameFg ?? null),
        seasonFgPct: fgPct(fg?.priorFg ?? null),
      });

      writes.push(
        prisma.teamGamePerformance.create({
          data: {
            gameId: game.id,
            teamId: side.teamId,
            seasonId: game.seasonId,
            opponentTeamId: side.opponentTeamId,
            isHome: side.isHome,
            isFavorite: favoriteFlag(side.m.expectedMargin),
            spread: side.spread,
            expectedMargin: side.m.expectedMargin,
            actualMargin: side.m.actualMargin,
            coverMargin: side.m.coverMargin,
            label: labelFor(side.m.coverMargin),
            tags: { create: tags.map((tag) => ({ tag })) },
          },
        }),
      );
    }

    await prisma.$transaction(writes);
    created += writes.length;
  }
  return created;
}

async function main() {
  const start = Date.now();
  const candidates = await loadCandidates();

  if (candidates.length === 0) {
    console.log("compute-team-game-performance: nothing to compute.");
    await prisma.$disconnect();
    return;
  }

  const seasonIds = [...new Set(candidates.map((g) => g.seasonId))];
  const fgLookup = await loadFgLookup(seasonIds);

  let created = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    created += await processBatch(candidates.slice(i, i + BATCH_SIZE), fgLookup);
  }

  console.log(
    `compute-team-game-performance done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `${candidates.length} game(s) graded, ${created} performance row(s) created.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
