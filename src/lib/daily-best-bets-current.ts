import { prisma } from "@/lib/db";
import { selectBestBets } from "@lib/betting/select-best-bets";
import type { PropStatType } from "@lib/espn/prop-types";

/**
 * Persists the live-market counterpart to DailyBestBet (see that table's
 * schema comment, and DailyBestBetCurrent's own, for why this needs its
 * own line/lean/odds rather than reusing the frozen pick's). A row here
 * gets overwritten in place, not re-created, every time its prop is still
 * part of the live top N — so a prop whose line moves mid-day (e.g.
 * Tyler Herro's 3PM line drifting from 0.5 to 1.5) is never graded twice
 * for the same day; there's always exactly one row per (date, player,
 * stat type), holding only its latest captured line/lean/odds.
 */

export interface DailyBestBetCurrentCandidate {
  playerId: number;
  gameId: number;
  statType: PropStatType;
  edgeRatio: number;
  line: number;
  lean: "OVER" | "UNDER";
  odds: number | null;
}

export interface DailyBestBetCurrentRow {
  rank: number;
  gameId: number;
  playerId: number;
  statType: PropStatType;
  line: number;
  lean: "OVER" | "UNDER";
  odds: number | null;
  edgeRatioAtSelection: number;
}

/** Reads every row tracked for a local day so far — can hold more than the
 * day's top-N limit, since a prop that was in the live top N earlier and
 * has since dropped out still keeps its row (see module comment); callers
 * that want "what's live right now" should filter/rank fresh candidates
 * themselves rather than read this back as a live top-N list. */
export async function getDailyBestBetCurrentSnapshot(
  dateKey: string,
): Promise<DailyBestBetCurrentRow[] | null> {
  const rows = await prisma.dailyBestBetCurrent.findMany({
    where: { date: dateKey },
    orderBy: { rank: "asc" },
    select: {
      rank: true,
      gameId: true,
      playerId: true,
      statType: true,
      line: true,
      lean: true,
      odds: true,
      edgeRatioAtSelection: true,
    },
  });
  return rows.length > 0 ? rows : null;
}

/** Upserts `dateKey`'s live top-N selection from `candidates` — callers
 * must already have filtered `candidates` down to not-yet-FINAL games,
 * since a game going FINAL means there's nothing further to capture and
 * writing here again would risk overwriting the last real live value with
 * a now-frozen one. No-op when `candidates` is empty (e.g. nothing has
 * synced yet, or every game for the day is already FINAL) rather than
 * writing an empty selection over whatever's already on record. */
export async function upsertDailyBestBetCurrent(
  dateKey: string,
  candidates: DailyBestBetCurrentCandidate[],
  limit: number,
): Promise<void> {
  const picks = selectBestBets(candidates, limit);
  if (picks.length === 0) return;

  await Promise.all(
    picks.map((p, i) =>
      prisma.dailyBestBetCurrent.upsert({
        where: {
          date_playerId_statType: {
            date: dateKey,
            playerId: p.playerId,
            statType: p.statType,
          },
        },
        create: {
          date: dateKey,
          rank: i + 1,
          gameId: p.gameId,
          playerId: p.playerId,
          statType: p.statType,
          line: p.line,
          lean: p.lean,
          odds: p.odds,
          edgeRatioAtSelection: p.edgeRatio,
        },
        update: {
          rank: i + 1,
          gameId: p.gameId,
          line: p.line,
          lean: p.lean,
          odds: p.odds,
          edgeRatioAtSelection: p.edgeRatio,
        },
      }),
    ),
  );
}
