"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

interface NewsArticle {
  id: number;
  headline: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  teams: { id: number; abbreviation: string; displayName: string }[];
  players: { id: number; displayName: string }[];
}

async function fetchNews(): Promise<NewsArticle[]> {
  const res = await fetch("/api/news");
  if (!res.ok) throw new Error("Failed to load news");
  const data = await res.json();
  return data.articles;
}

export default function NewsPage() {
  const { data: articles, isLoading, error } = useQuery({ queryKey: ["news"], queryFn: fetchNews });

  if (isLoading) return <p className="text-foreground/82">Loading news…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load news.</p>;
  if (!articles || articles.length === 0) return <p className="text-foreground/72">No news available.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold tracking-tight">News</h1>
      <div className="space-y-3">
        {articles.map((article) => (
          // A plain div, not a link — the headline below is the (external)
          // article link, and team links are separate sibling links;
          // nesting an <a> inside an <a> is invalid HTML and causes a
          // hydration error (confirmed during M10).
          <div
            key={article.id}
            className="flex gap-4 rounded-lg border border-border bg-surface p-4"
          >
            {article.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
              <img src={article.imageUrl} alt="" className="h-20 w-32 object-cover rounded-md shrink-0" />
            )}
            <div className="space-y-1">
              <a
                href={article.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-foreground/92"
              >
                {article.headline}
              </a>
              {article.description && article.description !== article.headline && (
                <p className="text-foreground/82 text-sm">{article.description}</p>
              )}
              <div className="flex gap-2 text-xs text-foreground/72">
                {article.publishedAt && <span>{new Date(article.publishedAt).toLocaleDateString()}</span>}
                {article.teams.map((t) => (
                  <Link key={t.id} href={`/teams/${t.id}`} className="hover:text-foreground/92">
                    {t.abbreviation}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
