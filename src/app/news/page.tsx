"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

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

const LIMIT_OPTIONS = [25, 50, 100];
type SortOrder = "newest" | "oldest";

async function fetchNews(limit: number): Promise<NewsArticle[]> {
  const res = await fetch(`/api/news?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load news");
  const data = await res.json();
  return data.articles;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NewsPage() {
  const [limit, setLimit] = useState(50);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const { data, isLoading, error } = useQuery({
    queryKey: ["news", limit],
    queryFn: () => fetchNews(limit),
  });

  const articles = useMemo(() => {
    if (!data) return data;
    return sortOrder === "newest" ? data : [...data].reverse();
  }, [data, sortOrder]);

  if (isLoading) return <p className="text-foreground/82">Loading news…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load news.</p>;
  if (!articles || articles.length === 0) return <p className="text-foreground/72">No news available.</p>;

  const [lead, ...rest] = articles;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">News</h1>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-foreground/92"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-foreground/92"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Show {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Link
        href={`/news/${lead.id}`}
        className="group relative block overflow-hidden rounded-xl bg-surface-muted"
      >
        {lead.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
          <img
            src={lead.imageUrl}
            alt=""
            className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-72"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-5">
          {lead.publishedAt && (
            <span className="text-xs font-medium uppercase tracking-wide text-white/70">
              {timeAgo(lead.publishedAt)}
            </span>
          )}
          <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">{lead.headline}</h2>
          {lead.description && (
            <p className="hidden max-w-2xl text-sm text-white/80 sm:block">{lead.description}</p>
          )}
        </div>
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((article) => (
          <Link
            key={article.id}
            href={`/news/${article.id}`}
            className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-transform hover:-translate-y-0.5"
          >
            {article.imageUrl && (
              <div className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images */}
                <img
                  src={article.imageUrl}
                  alt=""
                  className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1.5 p-4">
              <h3 className="font-semibold leading-snug group-hover:text-foreground/92">{article.headline}</h3>
              {article.description && (
                <p className="line-clamp-2 text-sm text-foreground/72">{article.description}</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-foreground/60">
                {article.publishedAt && <span>{timeAgo(article.publishedAt)}</span>}
                {article.teams.map((t) => (
                  <span key={t.id} className="rounded-full bg-surface-muted px-2 py-0.5 font-medium">
                    {t.abbreviation}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
