import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const articles = await prisma.newsArticle.findMany({
      orderBy: { publishedAt: "desc" },
      take: 50,
      include: {
        teams: { select: { teamId: true } },
        players: { select: { playerId: true } },
      },
    });

    const teamIds = [...new Set(articles.flatMap((a) => a.teams.map((t) => t.teamId)))];
    const playerIds = [...new Set(articles.flatMap((a) => a.players.map((p) => p.playerId)))];
    const [teams, players] = await Promise.all([
      prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, abbreviation: true, displayName: true } }),
      prisma.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, displayName: true } }),
    ]);
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const playerById = new Map(players.map((p) => [p.id, p]));

    const shaped = articles.map((a) => ({
      id: a.id,
      headline: a.headline,
      description: a.description,
      url: a.url,
      imageUrl: a.imageUrl,
      publishedAt: a.publishedAt,
      teams: a.teams.map((t) => teamById.get(t.teamId)).filter(Boolean),
      players: a.players.map((p) => playerById.get(p.playerId)).filter(Boolean),
    }));

    return NextResponse.json({ articles: shaped });
  } catch {
    return NextResponse.json({ error: "Failed to load news" }, { status: 500 });
  }
}
