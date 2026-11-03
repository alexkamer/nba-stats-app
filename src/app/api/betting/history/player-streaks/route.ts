import { prisma } from "@/lib/db";
import {
  ELIGIBLE_STREAK_STAT_TYPES,
  STREAK_STAT_FLOORS,
  evaluatePlayerStreak,
  type EligibleStreakStatType,
} from "@lib/betting/player-prop-streaks";
import type { PropStatType } from "@lib/espn/prop-types";
import { NextResponse } from "next/server";

const ELIGIBLE_PROP_STAT_TYPES: PropStatType[] = [...ELIGIBLE_STREAK_STAT_TYPES];

// Serves the betting-history-page capability's "Player streaks" section:
// players with a live OVER prop (on POINTS/REBOUNDS/ASSISTS, the only stat
// types with a fixed floor defined — see player-prop-streak-tracking)
// clearing that floor consistently. Only ever looks at OVER props — an
// Under pick gets no signal from "has this player been scoring a lot."
// Scoped to the earliest upcoming date (today or later) with any eligible
// OVER prop, so the section still shows something useful on a day with no
// games today (see design.md "Relevant date resolution").

const STAT_FIELD: Record<EligibleStreakStatType, "points" | "rebounds" | "assists"> = {
  POINTS: "points",
  REBOUNDS: "rebounds",
  ASSISTS: "assists",
};

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
      select: { playerId: true, points: true, rebounds: true, assists: true },
    });

    const gamesByPlayer = new Map<number, typeof recentGames>();
    for (const game of recentGames) {
      const list = gamesByPlayer.get(game.playerId) ?? [];
      list.push(game);
      gamesByPlayer.set(game.playerId, list);
    }

    const entries = eligibleProps
      .map((prop) => {
        const statType = prop.statType as EligibleStreakStatType;
        const field = STAT_FIELD[statType];
        const floor = STREAK_STAT_FLOORS[statType];
        const recentValues = (gamesByPlayer.get(prop.playerId) ?? [])
          .map((g) => g[field])
          .filter((v): v is number => v !== null);
        const { streak, hitRate, notable } = evaluatePlayerStreak(recentValues, floor);
        return { player: prop.player, statType, floor, streak, hitRate, notable };
      })
      .filter((entry) => entry.notable)
      .sort((a, b) => b.streak - a.streak || (b.hitRate ?? 0) - (a.hitRate ?? 0));

    return NextResponse.json({ date: relevantDayStart, entries });
  } catch (error) {
    console.error("GET /api/betting/history/player-streaks failed:", error);
    return NextResponse.json({ error: "Failed to load player streaks" }, { status: 500 });
  }
}
