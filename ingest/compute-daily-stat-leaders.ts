/**
 * Betting history — King of the Court aggregation (see
 * openspec/changes/add-betting-history-page). For calendar dates where
 * every scheduled game has reached FINAL and no `DailyStatLeader` row
 * exists yet, sums points+rebounds+assists per player across that date's
 * `PlayerGameStat` rows and records the day's leader(s) (ties kept) and
 * whether any player recorded a triple-double.
 *
 * Self-healing: only processes dates not yet recorded, so re-running is
 * safe and cheap. A date with any non-final game (postponed, in progress)
 * is simply skipped until every game on it resolves.
 *
 * Run with: npx tsx ingest/compute-daily-stat-leaders.ts
 */
import { prisma } from "./lib/db";
import { findDailyLeaders, type DailyPlayerStatRow } from "../lib/projections/daily-leader";

/** Local (not UTC) YYYY-MM-DD day bucket — same convention as the
 * betting-insights accuracy route's `dayKey`. */
function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

async function findReadyDates(): Promise<Map<string, number[]>> {
  const games = await prisma.game.findMany({ select: { id: true, date: true, status: true } });

  const byDay = new Map<string, { gameIds: number[]; allFinal: boolean }>();
  for (const game of games) {
    const key = dayKey(game.date);
    const entry = byDay.get(key) ?? { gameIds: [], allFinal: true };
    entry.gameIds.push(game.id);
    if (game.status !== "FINAL") entry.allFinal = false;
    byDay.set(key, entry);
  }

  const existing = await prisma.dailyStatLeader.findMany({ select: { date: true } });
  const existingKeys = new Set(existing.map((d) => dayKey(d.date)));

  const ready = new Map<string, number[]>();
  for (const [key, entry] of byDay) {
    if (entry.allFinal && !existingKeys.has(key)) ready.set(key, entry.gameIds);
  }
  return ready;
}

async function computeDate(key: string, gameIds: number[]) {
  const stats = await prisma.playerGameStat.findMany({
    where: { gameId: { in: gameIds } },
    select: { playerId: true, points: true, rebounds: true, assists: true, threeMade: true, steals: true, blocks: true },
  });
  if (stats.length === 0) return; // no box scores yet to compute from

  const rows: DailyPlayerStatRow[] = stats.map((s) => ({ ...s, minutes: null }));
  const leaders = findDailyLeaders(rows);

  await prisma.dailyStatLeader.create({
    data: {
      date: parseDayKey(key),
      entries: {
        create: leaders.map((l) => ({
          playerId: l.playerId,
          pointsReboundsAssists: l.pointsReboundsAssists,
          hadTripleDouble: l.hadTripleDouble,
        })),
      },
    },
  });
}

async function main() {
  const start = Date.now();
  const ready = await findReadyDates();

  let computed = 0;
  for (const [key, gameIds] of ready) {
    await computeDate(key, gameIds);
    computed += 1;
  }

  console.log(
    `compute-daily-stat-leaders done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `${ready.size} date(s) ready, ${computed} computed.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
