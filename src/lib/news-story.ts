import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/db";

const PLAYER_LINK_RE = /https?:\/\/(?:www\.)?espn\.com\/nba\/player\/(?:news\/)?_\/id\/(\d+)(?:\/[^"'\s)]*)?/gi;
const TEAM_LINK_RE = /https?:\/\/(?:www\.)?espn\.com\/nba\/team\/_\/name\/([a-z]+)(?:\/[^"'\s)]*)?/gi;
const EXTERNAL_ANCHOR_RE = /<a href="(https?:\/\/[^"]+)"/gi;

async function rewriteEspnLinks(html: string): Promise<string> {
  const [players, teams] = await Promise.all([
    prisma.player.findMany({ select: { id: true, espnId: true } }),
    prisma.team.findMany({ select: { id: true, abbreviation: true } }),
  ]);
  const playerIdByEspnId = new Map(players.map((p) => [p.espnId, p.id]));
  const teamIdByAbbr = new Map(teams.map((t) => [t.abbreviation.toLowerCase(), t.id]));

  let rewritten = html
    .replace(PLAYER_LINK_RE, (match, espnId: string) => {
      const id = playerIdByEspnId.get(espnId);
      return id ? `/players/${id}` : match;
    })
    .replace(TEAM_LINK_RE, (match, abbr: string) => {
      const id = teamIdByAbbr.get(abbr.toLowerCase());
      return id ? `/teams/${id}` : match;
    });

  // Remaining external links (ESPN articles we don't mirror, other sites)
  // open in a new tab instead of navigating away from the app.
  rewritten = rewritten.replace(EXTERNAL_ANCHOR_RE, '<a href="$1" target="_blank" rel="noopener noreferrer"');

  return rewritten;
}

export async function sanitizeStory(story: string | null): Promise<string | null> {
  if (!story) return null;
  const clean = sanitizeHtml(story, {
    allowedTags: ["p", "a", "br", "strong", "em", "b", "i", "ul", "ol", "li", "blockquote", "h2", "h3"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https"],
  });
  return rewriteEspnLinks(clean);
}
