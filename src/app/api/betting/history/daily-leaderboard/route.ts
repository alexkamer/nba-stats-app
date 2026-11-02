import { prisma } from "@/lib/db";
import { hasTripleDouble } from "@lib/projections/daily-leader";
import { NextResponse } from "next/server";

// Serves the betting-history-page capability's King of the Court day-detail
// view: the top 25 players by points+rebounds+assists total for a given
// date's games — not just that day's leader(s), which is all
// `DailyStatLeader` stores. Computed live from `PlayerGameStat` (no new
// storage), the same "no backing tracking capability needed" pattern the
// birthdays route already uses, since this is a one-off read rather than
// something queried repeatedly across the whole season.
const LEADERBOARD_SIZE = 25;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const match = dateParam && /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    if (!match) return NextResponse.json({ error: "Invalid or missing date" }, { status: 400 });

    const [, year, month, day] = match;
    const startOfDay = new Date(Number(year), Number(month) - 1, Number(day));
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const stats = await prisma.playerGameStat.findMany({
      where: { game: { date: { gte: startOfDay, lt: endOfDay } } },
      select: {
        points: true,
        rebounds: true,
        assists: true,
        threeMade: true,
        steals: true,
        blocks: true,
        teamId: true,
        player: { select: { id: true, espnId: true, displayName: true, headshotUrl: true } },
        team: { select: { id: true, abbreviation: true, logoUrl: true } },
        game: {
          select: {
            espnId: true,
            homeScore: true,
            awayScore: true,
            homeTeamId: true,
            homeTeam: { select: { abbreviation: true, logoUrl: true } },
            awayTeam: { select: { abbreviation: true, logoUrl: true } },
          },
        },
      },
    });

    const leaderboard = stats
      .map((s) => ({
        player: s.player,
        team: s.team,
        points: s.points ?? 0,
        rebounds: s.rebounds ?? 0,
        assists: s.assists ?? 0,
        pointsReboundsAssists: (s.points ?? 0) + (s.rebounds ?? 0) + (s.assists ?? 0),
        hadTripleDouble: hasTripleDouble({ ...s, minutes: null }),
        game: {
          espnId: s.game.espnId,
          // Player's own team always listed first, opponent second — e.g.
          // "MIN 133 - 120 ORL" reads as "this player's side, then the
          // other side", regardless of home/away.
          isHome: s.teamId === s.game.homeTeamId,
          teamScore: s.teamId === s.game.homeTeamId ? s.game.homeScore : s.game.awayScore,
          teamAbbreviation: s.teamId === s.game.homeTeamId ? s.game.homeTeam.abbreviation : s.game.awayTeam.abbreviation,
          teamLogoUrl: s.teamId === s.game.homeTeamId ? s.game.homeTeam.logoUrl : s.game.awayTeam.logoUrl,
          opponentScore: s.teamId === s.game.homeTeamId ? s.game.awayScore : s.game.homeScore,
          opponentAbbreviation: s.teamId === s.game.homeTeamId ? s.game.awayTeam.abbreviation : s.game.homeTeam.abbreviation,
          opponentLogoUrl: s.teamId === s.game.homeTeamId ? s.game.awayTeam.logoUrl : s.game.homeTeam.logoUrl,
        },
      }))
      .sort((a, b) => b.pointsReboundsAssists - a.pointsReboundsAssists)
      .slice(0, LEADERBOARD_SIZE);

    return NextResponse.json({ date: dateParam, leaderboard });
  } catch (error) {
    console.error("GET /api/betting/history/daily-leaderboard failed:", error);
    return NextResponse.json({ error: "Failed to load daily leaderboard" }, { status: 500 });
  }
}
