import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getNewsArticleLive } from "@/lib/espn-news-live";
import { sanitizeStory } from "@/lib/news-story";
import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";

// No local team/player tables to rewrite links against in ESPN-only mode —
// sanitize only.
function sanitizeStoryBasic(story: string | null): string | null {
  if (!story) return null;
  return sanitizeHtml(story, {
    allowedTags: ["p", "a", "br", "strong", "em", "b", "i", "ul", "ol", "li", "blockquote", "h2", "h3"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https"],
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (isEspnOnly()) {
      const article = await getNewsArticleLive(id);
      if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ article: { ...article, story: sanitizeStoryBasic(article.story) } });
    }

    const article = await prisma.newsArticle.findUnique({
      where: { id: Number(id) },
      include: {
        teams: { select: { teamId: true } },
        players: { select: { playerId: true } },
      },
    });
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [teams, players] = await Promise.all([
      prisma.team.findMany({
        where: { id: { in: article.teams.map((t) => t.teamId) } },
        select: { id: true, abbreviation: true, displayName: true },
      }),
      prisma.player.findMany({
        where: { id: { in: article.players.map((p) => p.playerId) } },
        select: { id: true, displayName: true },
      }),
    ]);

    return NextResponse.json({
      article: {
        id: article.id,
        headline: article.headline,
        description: article.description,
        url: article.url,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
        byline: article.byline,
        story: await sanitizeStory(article.story),
        teams,
        players,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load article" }, { status: 500 });
  }
}
