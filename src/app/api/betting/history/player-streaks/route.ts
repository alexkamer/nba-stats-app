import { prisma } from "@/lib/db";
import {
  ELIGIBLE_STREAK_STAT_TYPES,
  STREAK_STAT_THRESHOLDS,
  evaluatePlayerStreak,
  pickHighestNotableThreshold,
  type EligibleStreakStatType,
} from "@lib/betting/player-prop-streaks";
import type { PropStatType } from "@lib/espn/prop-types";
import { NextResponse } from "next/server";

const ELIGIBLE_PROP_STAT_TYPES: PropStatType[] = [...ELIGIBLE_STREAK_STAT_TYPES];

// Serves the betting-history-page capability's "Player streaks" section:
// players with a live OVER prop on an eligible stat type who are clearing a
// notable threshold on that stat's ladder consistently (see
// player-prop-streak-tracking). Only ever looks at OVER props — an Under
// pick gets no signal from "has this player been scoring a lot." Scoped to
// the earliest upcoming date (today or later) with any eligible OVER prop,
// so the section still shows something useful on a day with no games today
// (see design.md "Relevant date resolution").

type GameStatRow = {
  playerId: number;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  threeMade: number | null;
};

/** Value this stat type contributes for one game, or `null` when a
 * required underlying field is missing. DOUBLE_DOUBLE is a 0/1 flag for
 * whether the game cleared two of the five double-double categories. */
function statValueForGame(statType: EligibleStreakStatType, game: GameStatRow): number | null {
  switch (statType) {
    case "POINTS":
      return game.points;
    case "REBOUNDS":
      return game.rebounds;
    case "ASSISTS":
      return game.assists;
    case "THREE_POINTERS_MADE":
      return game.threeMade;
    case "POINTS_REBOUNDS_ASSISTS":
      return game.points === null || game.rebounds === null || game.assists === null
        ? null
        : game.points + game.rebounds + game.assists;
    case "POINTS_REBOUNDS":
      return game.points === null || game.rebounds === null ? null : game.points + game.rebounds;
    case "POINTS_ASSISTS":
      return game.points === null || game.assists === null ? null : game.points + game.assists;
    case "REBOUNDS_ASSISTS":
      return game.rebounds === null || game.assists === null ? null : game.rebounds + game.assists;
    case "DOUBLE_DOUBLE": {
      const categories = [game.points, game.rebounds, game.assists, game.steals, game.blocks];
      const doubleDigitCategories = categories.filter((v) => v !== null && v >= 10).length;
      return doubleDigitCategories >= 2 ? 1 : 0;
    }
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function GET() {
  try {
    const todayStart = startOfDay(new Date());

    const earliestEligible = await prisma.playerPropOdds.findFirst({
      where: {
        side: "OVER",
        statType: { in: ELIGIBLE_PROP_STAT_TYPES },
        game: { date: { gte: todayStart } },
      },
      orderBy: { game: { date: "asc" } },
      select: { game: { select: { date: true } } },
    });

    if (!earliestEligible) {
      return NextResponse.json({ date: null, entries: [] });
    }

    const relevantDayStart = startOfDay(earliestEligible.game.date);
    const relevantDayEnd = new Date(relevantDayStart);
    relevantDayEnd.setDate(relevantDayEnd.getDate() + 1);

    const eligibleProps = await prisma.playerPropOdds.findMany({
      where: {
        side: "OVER",
        statType: { in: ELIGIBLE_PROP_STAT_TYPES },
        game: { date: { gte: relevantDayStart, lt: relevantDayEnd } },
      },
      include: {
        player: {
          select: {
            id: true,
            espnId: true,
            displayName: true,
            headshotUrl: true,
            currentTeam: { select: { id: true, abbreviation: true, logoUrl: true, color: true } },
          },
        },
      },
    });

    const playerIds = [...new Set(eligibleProps.map((p) => p.playerId))];
    const recentGames = await prisma.playerGameStat.findMany({
      where: { playerId: { in: playerIds }, game: { status: "FINAL" } },
      orderBy: { game: { date: "desc" } },
      select: { playerId: true, points: true, rebounds: true, assists: true, steals: true, blocks: true, threeMade: true },
    });

    const gamesByPlayer = new Map<number, GameStatRow[]>();
    for (const game of recentGames) {
      const list = gamesByPlayer.get(game.playerId) ?? [];
      list.push(game);
      gamesByPlayer.set(game.playerId, list);
    }

    const entries = eligibleProps
      .map((prop) => {
        const statType = prop.statType as EligibleStreakStatType;
        const recentValues = (gamesByPlayer.get(prop.playerId) ?? [])
          .map((g) => statValueForGame(statType, g))
          .filter((v): v is number => v !== null);

        if (statType === "DOUBLE_DOUBLE") {
          const { streak, hitRate, notable } = evaluatePlayerStreak(recentValues, 1);
          return notable ? { player: prop.player, statType, floor: null, streak, hitRate } : null;
        }

        const evaluation = pickHighestNotableThreshold(recentValues, STREAK_STAT_THRESHOLDS[statType]);
        if (!evaluation) return null;
        return { player: prop.player, statType, floor: evaluation.threshold, streak: evaluation.streak, hitRate: evaluation.hitRate };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.streak - a.streak || (b.hitRate ?? 0) - (a.hitRate ?? 0));

    return NextResponse.json({ date: relevantDayStart, entries });
  } catch (error) {
    console.error("GET /api/betting/history/player-streaks failed:", error);
    return NextResponse.json({ error: "Failed to load player streaks" }, { status: 500 });
  }
}
