import { prisma } from "@/lib/db";
import {
  selectBestBets,
  type BestBetCandidate,
} from "@lib/betting/select-best-bets";
import type { PropStatType } from "@lib/espn/prop-types";

/**
 * Locks in a calendar day's Best Bets selection the first time it's
 * computed (see DailyBestBet in prisma/schema.prisma) — every later
 * request for the same `date` reads back this same frozen list instead of
 * re-ranking against whatever's changed since (a newly-ingested prop with
 * a bigger edge, a player ruled out promoting the next-best candidate), so
 * a pick already shown to an early visitor can't be silently swapped out
 * later the same day.
 */

export interface DailyBestBetRow {
  rank: number;
  gameId: number;
  playerId: number;
  statType: PropStatType;
  edgeRatioAtSelection: number;
}

/** Reads the frozen snapshot for a local day, if one has been locked in
 * yet — `null` when none exists, leaving it to the caller to decide what
 * that means (the live route locks one in; the accuracy routes fall back
 * to a live recompute for dates that predate this table). */
export async function getDailyBestBetSnapshot(
  dateKey: string,
): Promise<DailyBestBetRow[] | null> {
  const rows = await prisma.dailyBestBet.findMany({
    where: { date: dateKey },
    orderBy: { rank: "asc" },
    select: {
      rank: true,
      gameId: true,
      playerId: true,
      statType: true,
      edgeRatioAtSelection: true,
    },
  });
  return rows.length > 0 ? rows : null;
}

/** Locks in `dateKey`'s selection from `candidates` if nothing's locked in
 * yet, then returns whatever's now on record (freshly written or already
 * there). Takes already-filtered candidates (bettable, not DNP, not ruled
 * out) from the caller, since what counts as "eligible" depends on data
 * shapes the live route and the accuracy route each already assemble
 * their own way. A `candidates` list that's still empty (e.g. called
 * before the day's props have synced at all) writes nothing, so a later
 * call on the same day gets another chance to lock in a real selection
 * instead of freezing an empty one. */
export async function lockInDailyBestBets(
  dateKey: string,
  candidates: (BestBetCandidate & { gameId: number; statType: PropStatType })[],
  limit: number,
): Promise<DailyBestBetRow[] | null> {
  const existing = await getDailyBestBetSnapshot(dateKey);
  if (existing) return existing;

  const picks = selectBestBets(candidates, limit);
  if (picks.length === 0) return null;

  try {
    await prisma.dailyBestBet.createMany({
      data: picks.map((p, i) => ({
        date: dateKey,
        rank: i + 1,
        gameId: p.gameId,
        playerId: p.playerId,
        statType: p.statType,
        edgeRatioAtSelection: p.edgeRatio,
      })),
    });
  } catch {
    // SQLite's createMany can't skipDuplicates, so a race between two
    // concurrent "first request of the day" callers surfaces as a unique
    // constraint error here — whichever write lost just reads back the
    // winner's rows below instead of erroring out.
  }

  return getDailyBestBetSnapshot(dateKey);
}
