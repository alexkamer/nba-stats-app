// Espn-only equivalent of /api/news. Team/player relational tagging is
// dropped (would require matching article category ids against a live
// team/player directory on every request) — accepted simplification.
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints } from "@espn/endpoints";
import { mapNewsArticle, type EspnNewsArticle } from "../../ingest/mappers/news";
import { cachedEspn } from "./espn-cache";

interface EspnNewsResponse {
  articles: EspnNewsArticle[];
}

export interface LiveNewsArticle {
  id: string;
  headline: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  teams: never[];
  players: never[];
}

async function fetchNewsLive(limit: number): Promise<LiveNewsArticle[]> {
  const { articles } = await fetchEspnJson<EspnNewsResponse>(espnEndpoints.news(limit));
  return articles.map((article) => {
    const mapped = mapNewsArticle(article);
    return { ...mapped, id: mapped.espnId, teams: [], players: [] };
  });
}

export function getNewsLive(limit: number): Promise<LiveNewsArticle[]> {
  return cachedEspn(`news-live-${limit}`, 5 * 60 * 1000, () => fetchNewsLive(limit));
}
