// Shapes confirmed against a real ESPN NBA news call during M10. Note: the
// NBA news feed includes some cross-league content (e.g. WNBA stories that
// mention shared contributors) — team/player category ids that don't match
// anything in our DB are simply skipped by the caller, not an error.

export interface EspnNewsCategory {
  type: string;
  teamId?: number;
  athleteId?: number;
}

export interface EspnNewsArticle {
  id: number;
  type?: string;
  headline: string;
  description?: string;
  published?: string;
  images?: { url: string }[];
  links?: { web?: { href?: string } };
  categories?: EspnNewsCategory[];
}

export interface NewsArticleUpsertInput {
  espnId: string;
  type: string | null;
  headline: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
}

export function mapNewsArticle(article: EspnNewsArticle): NewsArticleUpsertInput {
  return {
    espnId: String(article.id),
    type: article.type ?? null,
    headline: article.headline,
    description: article.description ?? null,
    url: article.links?.web?.href ?? null,
    imageUrl: article.images?.[0]?.url ?? null,
    publishedAt: article.published ? new Date(article.published) : null,
  };
}

export function teamEspnIdsOf(article: EspnNewsArticle): string[] {
  return (article.categories ?? [])
    .filter((c) => c.type === "team" && c.teamId !== undefined)
    .map((c) => String(c.teamId));
}

export function athleteEspnIdsOf(article: EspnNewsArticle): string[] {
  return (article.categories ?? [])
    .filter((c) => c.type === "athlete" && c.athleteId !== undefined)
    .map((c) => String(c.athleteId));
}
