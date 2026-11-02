import { prisma } from "@/lib/db";
import { hasTripleDouble } from "@lib/projections/daily-leader";
import { NextResponse } from "next/server";

// Serves the betting-history-page capability's "On this day" section: the
// top individual points+rebounds+assists performances recorded on today's
// calendar month/day across all past seasons — not scoped to the current
// season, unlike the rest of this page, since the point is precisely that
// it reaches back into full history. Computed live via a raw query (no new
// storage): SQLite's `strftime` isn't expressible through Prisma's query
// builder, and this is a cheap, once-a-day-per-viewer query over an
// indexed join, not worth precomputing 365 days in advance.
const RESULT_LIMIT = 5;

interface RawRow {
  playerId: number;
  playerEspnId: string;
  playerDisplayName: string;
  playerHeadshotUrl: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  pra: bigint;
  gameEspnId: string;
  date: string;
  teamId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
}

export async function GET() {
  try {
    const now = new Date();
    const monthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const currentYear = String(now.getFullYear());

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT pgs.player_id as playerId, p.espn_id as playerEspnId, p.display_name as playerDisplayName,
        p.headshot_url as playerHeadshotUrl, pgs.points as points, pgs.rebounds as rebounds, pgs.assists as assists,
        pgs.steals as steals, pgs.blocks as blocks,
        (pgs.points + pgs.rebounds + pgs.assists) as pra, g.espn_id as gameEspnId, g.date as date,
        pgs.team_id as teamId, g.home_team_id as homeTeamId, g.away_team_id as awayTeamId,
        g.home_score as homeScore, g.away_score as awayScore
      FROM player_game_stat pgs
      JOIN game g ON pgs.game_id = g.id
      JOIN player p ON p.id = pgs.player_id
      WHERE strftime('%m-%d', g.date) = ${monthDay} AND strftime('%Y', g.date) != ${currentYear} AND g.status = 'FINAL'
      ORDER BY pra DESC
      LIMIT ${RESULT_LIMIT}
    `;

    const teamIds = [...new Set(rows.flatMap((r) => [r.teamId, r.homeTeamId, r.awayTeamId]))];
    const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, abbreviation: true, name: true, logoUrl: true } });
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const performances = rows.map((r) => {
      const isHome = r.teamId === r.homeTeamId;
      const team = teamsById.get(r.teamId) ?? null;
      const opponent = teamsById.get(isHome ? r.awayTeamId : r.homeTeamId) ?? null;
      return {
        player: { id: r.playerId, espnId: r.playerEspnId, displayName: r.playerDisplayName, headshotUrl: r.playerHeadshotUrl },
        points: r.points,
        rebounds: r.rebounds,
        assists: r.assists,
        pointsReboundsAssists: Number(r.pra),
        hadTripleDouble: hasTripleDouble({ points: r.points, rebounds: r.rebounds, assists: r.assists, steals: r.steals, blocks: r.blocks, threeMade: null, minutes: null }),
        gameEspnId: r.gameEspnId,
        date: r.date,
        year: new Date(r.date).getFullYear(),
        team,
        opponent,
        teamScore: isHome ? r.homeScore : r.awayScore,
        opponentScore: isHome ? r.awayScore : r.homeScore,
        isHome,
      };
    });

    return NextResponse.json({ monthDay, performances });
  } catch (error) {
    console.error("GET /api/betting/history/on-this-day failed:", error);
    return NextResponse.json({ error: "Failed to load on-this-day performances" }, { status: 500 });
  }
}
