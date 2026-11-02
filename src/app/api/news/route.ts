import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getNewsLive } from "@/lib/espn-news-live";
import { NextRequest, NextResponse } from "next/server";

// "Media"-typed game highlight clips and "Preview"-typed auto-generated
// game blurbs aren't articles — exclude them from the news feed.
const GAME_HIGHLIGHTS_RE = /:\s*Game Highlights$/i;
const EXCLUDED_TYPES = new Set(["Preview"]);
function isExcluded(article: { type: string | null; headline: string }): boolean {
  return GAME_HIGHLIGHTS_RE.test(article.headline) || (!!article.type && EXCLUDED_TYPES.has(article.type));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerIdParam = searchParams.get("playerId");
    const playerId = playerIdParam ? Number(playerIdParam) : null;
    const limitParam = searchParams.get("limit");
    const take = limitParam ? Number(limitParam) : 50;
    const type = searchParams.get("type");

    if (isEspnOnly()) {
      // playerId filtering requires a local join we don't have live —
      // return the general feed regardless (see docs/DATA_SOURCES.md).
      const articles = (await getNewsLive(take))
        .filter((a) => !type || a.type === type)
        .filter((a) => !isExcluded(a));
      return NextResponse.json({ articles });
    }

    // Over-fetch since excluded article types get filtered out after the
    // query, so the final result still has up to `take` articles.
    const rows = await prisma.newsArticle.findMany({
      where: {
        ...(playerId ? { players: { some: { playerId } } } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: take * 2,
      include: {
        teams: { select: { teamId: true } },
        players: { select: { playerId: true } },
      },
    });
    const articles = rows.filter((a) => !isExcluded(a)).slice(0, take);

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
