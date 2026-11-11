import { prisma } from "@/lib/db";
import { getDailyBestBetSnapshot } from "@/lib/daily-best-bets";
import { selectBestBets } from "@lib/betting/select-best-bets";
import { computeEdgeRatio, BEST_BETS_PER_DAY } from "@lib/projections/confidence";
import { parseDateKey } from "@/lib/briefing/date";

/**
 * Best Bets section + prior-day record callback for daily-briefing-page —
 * reuses the frozen Initial-view selection (`DailyBestBet`, see
 * best-bets-selection) and grading already on `PlayerPropProjection` (see
 * prediction-accuracy-tracking) rather than re-deriving either.
 *
 * Most past dates never had anyone load the live betting page that day, so
 * `DailyBestBet` was never locked in for them (it only locks in on first
 * live request — see src/lib/daily-best-bets.ts). Per best-bets-selection's
 * "Shared selection logic for display and grading" requirement, this falls
 * back to re-deriving that day's picks with the same ranked,
 * per-player-deduplicated `selectBestBets` logic the live strip and the
 * accuracy route both already use — never a second, separately-implemented
 * selection rule.
 */

export interface BestBetPickRow {
  rank: number;
  playerId: number;
  statType: string;
  player: { id: number; displayName: string; headshotUrl: string | null };
  line: number | null;
  lean: "OVER" | "UNDER" | null;
  gradedCorrect: boolean | null;
}

export interface BestBetsRecord {
  wins: number;
  losses: number;
  record: string;
}

/** Win-loss record from a set of graded (`true`/`false`) results — a push
 * (`null`) is excluded from both the count and the denominator, same
 * convention as `computeAccuracy`. `null` when nothing is decided yet. */
export function summarizeRecord(results: Array<boolean | null>): BestBetsRecord | null {
  const decided = results.filter((r): r is boolean => r !== null);
  if (decided.length === 0) return null;
  const wins = decided.filter(Boolean).length;
  const losses = decided.length - wins;
  return { wins, losses, record: `${wins}-${losses}` };
}

function toPickRow(projection: {
  gameId: number;
  playerId: number;
  statType: string;
  line: number | null;
  projectedValue: number;
  gradedCorrect: boolean | null;
  player: { id: number; displayName: string; headshotUrl: string | null };
}): BestBetPickRow {
  return {
    rank: 0, // overwritten by the caller once final order is known
    playerId: projection.playerId,
    statType: projection.statType,
    player: projection.player,
    line: projection.line,
    lean:
      projection.line != null
        ? projection.projectedValue > projection.line
          ? "OVER"
          : "UNDER"
        : null,
    gradedCorrect: projection.gradedCorrect,
  };
}

/** Re-derives a date's Best Bets picks by live-recomputing from that
 * date's already-graded, bettable `PlayerPropProjection` rows — only
 * returns results for a date whose games are already final (nothing to
 * decide otherwise), same subset the accuracy route calls "decided". */
async function recomputeBestBetsForDate(dateKey: string): Promise<BestBetPickRow[] | null> {
  const startOfDay = parseDateKey(dateKey);
  if (!startOfDay) return null;
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const rows = await prisma.playerPropProjection.findMany({
    where: {
      bettable: true,
      gradedCorrect: { not: null },
      game: { date: { gte: startOfDay, lt: endOfDay } },
    },
    select: {
      gameId: true,
      playerId: true,
      statType: true,
      line: true,
      projectedValue: true,
      stdev: true,
      gradedCorrect: true,
      player: { select: { id: true, displayName: true, headshotUrl: true } },
    },
  });
  if (rows.length === 0) return null;

  const candidates = rows.map((r) => ({
    ...r,
    edgeRatio: computeEdgeRatio(r.projectedValue, r.line, r.stdev) ?? 0,
  }));
  const picks = selectBestBets(candidates, BEST_BETS_PER_DAY);
  return picks.map((p, i) => ({ ...toPickRow(p), rank: i + 1 }));
}

/** `null` when no Best Bets selection exists for this date — either a
 * locked-in `DailyBestBet` snapshot, or (for a date whose games are
 * already final) a live recomputation using the same selection logic. */
export async function getBestBetsForDate(dateKey: string): Promise<BestBetPickRow[] | null> {
  const snapshot = await getDailyBestBetSnapshot(dateKey);
  if (!snapshot) return recomputeBestBetsForDate(dateKey);

  const projections = await prisma.playerPropProjection.findMany({
    where: {
      OR: snapshot.map((p) => ({ gameId: p.gameId, playerId: p.playerId, statType: p.statType })),
    },
    select: {
      gameId: true,
      playerId: true,
      statType: true,
      line: true,
      projectedValue: true,
      gradedCorrect: true,
      player: { select: { id: true, displayName: true, headshotUrl: true } },
    },
  });
  const byKey = new Map(
    projections.map((p) => [`${p.gameId}|${p.playerId}|${p.statType}`, p]),
  );

  return snapshot.map((pick) => {
    const projection = byKey.get(`${pick.gameId}|${pick.playerId}|${pick.statType}`);
    return {
      rank: pick.rank,
      playerId: pick.playerId,
      statType: pick.statType,
      player: projection?.player ?? { id: pick.playerId, displayName: "Unknown player", headshotUrl: null },
      line: projection?.line ?? null,
      lean:
        projection?.line != null && projection?.projectedValue != null
          ? projection.projectedValue > projection.line
            ? "OVER"
            : "UNDER"
          : null,
      gradedCorrect: projection?.gradedCorrect ?? null,
    };
  });
}

/** The callback line's record for the date before the viewed one — `null`
 * when that prior date has no locked-in Best Bets selection at all. */
export async function getBestBetsRecordForDate(dateKey: string): Promise<BestBetsRecord | null> {
  const picks = await getBestBetsForDate(dateKey);
  if (!picks) return null;
  return summarizeRecord(picks.map((p) => p.gradedCorrect));
}
