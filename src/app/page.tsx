"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useState } from "react";
import { CircularBadge } from "@/components/CircularBadge";
import { SectionCard } from "@/components/SectionCard";

interface GameCard {
  espnId: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null };
  away: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null };
}

interface Standing {
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
  team: { id: number; displayName: string; abbreviation: string; logoUrl?: string | null };
}

interface StandingsResponse {
  conferences: { conferenceName: string; standings: Standing[] }[];
}

interface NewsArticle {
  id: number;
  headline: string;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
}

function todayYyyymmdd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchScoreboard(date: string): Promise<GameCard[]> {
  const res = await fetch(`/api/scoreboard?date=${date}`);
  if (!res.ok) throw new Error("Failed to load scoreboard");
  const data = await res.json();
  return data.games;
}

async function fetchStandings(): Promise<StandingsResponse> {
  const res = await fetch("/api/standings");
  if (!res.ok) throw new Error("Failed to load standings");
  return res.json();
}

async function fetchNews(): Promise<NewsArticle[]> {
  const res = await fetch("/api/news?limit=4");
  if (!res.ok) throw new Error("Failed to load news");
  const data = await res.json();
  return data.articles;
}

export default function HomePage() {
  // Reading today's date would be evaluated during the server prerender
  // instead of per-visit (Next.js breaking change) unless deferred behind
  // Suspense — same pattern as the scoreboard page.
  return (
    <Suspense fallback={<p className="text-foreground/82">Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const [date] = useState(() => todayYyyymmdd());
  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ["scoreboard", date],
    queryFn: () => fetchScoreboard(date),
  });
  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["standings"],
    queryFn: fetchStandings,
  });
  const { data: news, isLoading: newsLoading } = useQuery({
    queryKey: ["news", "home"],
    queryFn: fetchNews,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          NBA <span className="text-accent">Stats</span>
        </h1>
        <p className="text-foreground/72">Scores, standings, and news in one place.</p>
      </div>

      <SectionCard
        title="Today's Games"
        accentColor="var(--accent)"
        action={
          <Link href="/scoreboard" className="text-sm font-semibold text-accent hover:underline">
            Full scoreboard
          </Link>
        }
      >
        {gamesLoading && <p className="text-foreground/72 text-sm">Loading…</p>}
        {!gamesLoading && (!games || games.length === 0) && (
          <p className="text-foreground/72 text-sm">No games scheduled today.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {games
            ?.slice()
            .sort(
              (a, b) =>
                Number(b.statusName === "STATUS_IN_PROGRESS") - Number(a.statusName === "STATUS_IN_PROGRESS"),
            )
            .slice(0, 6)
            .map((game) => {
              const isLive = game.statusName === "STATUS_IN_PROGRESS";
              return (
                <Link
                  key={game.espnId}
                  href={`/games/${game.espnId}`}
                  className="flex flex-col gap-2 rounded-md border border-border p-3 transition-colors hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/60">
                    {isLive && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
                    {isLive ? `Q${game.period} ${game.clock ?? ""}` : game.statusDetail}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <CircularBadge src={game.away.logoUrl} alt="" size="sm" />
                      {game.away.abbreviation}
                    </span>
                    <span className="font-display text-lg font-extrabold tabular-nums">{game.away.score ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <CircularBadge src={game.home.logoUrl} alt="" size="sm" />
                      {game.home.abbreviation}
                    </span>
                    <span className="font-display text-lg font-extrabold tabular-nums">{game.home.score ?? "-"}</span>
                  </div>
                </Link>
              );
            })}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Standings"
          accentColor="var(--accent)"
          action={
            <Link href="/standings" className="text-sm font-semibold text-accent hover:underline">
              Full standings
            </Link>
          }
        >
          {standingsLoading && <p className="text-foreground/72 text-sm">Loading…</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {standings?.conferences.map((conf) => (
              <div key={conf.conferenceName} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/60">{conf.conferenceName}</h3>
                <div className="space-y-1.5">
                  {conf.standings
                    .slice()
                    .sort((a, b) => (a.conferenceRank ?? 99) - (b.conferenceRank ?? 99))
                    .slice(0, 5)
                    .map((s) => (
                      <Link
                        key={s.team.id}
                        href={`/teams/${s.team.id}`}
                        className="flex items-center justify-between gap-2 text-sm hover:text-foreground"
                      >
                        <span className="flex items-center gap-2 truncate text-foreground/82">
                          <span className="w-4 shrink-0 text-right text-xs text-foreground/50">{s.conferenceRank}</span>
                          <CircularBadge src={s.team.logoUrl} alt="" size="xs" />
                          <span className="truncate">{s.team.displayName}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground/60">
                          {s.wins}-{s.losses}
                        </span>
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Latest News"
          accentColor="var(--accent)"
          action={
            <Link href="/news" className="text-sm font-semibold text-accent hover:underline">
              All news
            </Link>
          }
        >
          {newsLoading && <p className="text-foreground/72 text-sm">Loading…</p>}
          {!newsLoading && (!news || news.length === 0) && (
            <p className="text-foreground/72 text-sm">No news available.</p>
          )}
          <div className="space-y-3">
            {news?.map((article) => (
              <a
                key={article.id}
                href={article.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 group"
              >
                {article.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
                  <img src={article.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
                )}
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-snug group-hover:text-foreground/92">{article.headline}</p>
                  {article.publishedAt && (
                    <p className="text-xs text-foreground/60">{new Date(article.publishedAt).toLocaleDateString()}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
