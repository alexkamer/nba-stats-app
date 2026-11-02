"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";

interface ArticleDetail {
  id: number;
  headline: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  byline: string | null;
  story: string | null;
  teams: { id: number; abbreviation: string; displayName: string }[];
  players: { id: number; displayName: string }[];
}

async function fetchArticle(id: string): Promise<ArticleDetail> {
  const res = await fetch(`/api/news/${id}`);
  if (!res.ok) throw new Error("Failed to load article");
  const data = await res.json();
  return data.article;
}

export default function NewsArticlePage() {
  return (
    <Suspense fallback={<p className="text-foreground/82">Loading article…</p>}>
      <NewsArticleContent />
    </Suspense>
  );
}

function NewsArticleContent() {
  const { id } = useParams<{ id: string }>();
  const { data: article, isLoading, error } = useQuery({
    queryKey: ["news", id],
    queryFn: () => fetchArticle(id),
  });

  if (isLoading) return <p className="text-foreground/82">Loading article…</p>;
  if (error || !article) return <p className="text-red-600 dark:text-red-400">Failed to load article.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/news" className="text-sm text-foreground/60 hover:text-foreground/92">
        ← Back to news
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {article.headline}
        </h1>
        {article.description && article.description !== article.headline && (
          <p className="text-lg text-foreground/72">{article.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/60">
          {article.byline && <span>{article.byline}</span>}
          {article.byline && article.publishedAt && <span>·</span>}
          {article.publishedAt && <span>{new Date(article.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>}
        </div>
        {article.teams.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {article.teams.map((t) => (
              <Link
                key={t.id}
                href={`/teams/${t.id}`}
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium hover:text-foreground/92"
              >
                {t.abbreviation}
              </Link>
            ))}
            {article.players.map((p) => (
              <Link
                key={p.id}
                href={`/players/${p.id}`}
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium hover:text-foreground/92"
              >
                {p.displayName}
              </Link>
            ))}
          </div>
        )}
      </div>

      {article.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
        <img src={article.imageUrl} alt="" className="w-full rounded-xl object-cover" />
      )}

      {article.story ? (
        <div
          className="prose-news space-y-4 text-foreground/92 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-foreground/72"
          dangerouslySetInnerHTML={{ __html: article.story }}
        />
      ) : (
        <p className="text-foreground/72">{article.description}</p>
      )}

      {article.url && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-foreground/60 hover:text-foreground/92"
        >
          View original on ESPN →
        </a>
      )}
    </div>
  );
}
