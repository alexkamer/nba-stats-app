"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, Suspense, useState } from "react";
import { CircularBadge } from "@/components/CircularBadge";
import { SectionCard } from "@/components/SectionCard";

interface GameCard {
  espnId: string;
  date: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  spreadDetails: string | null;
  home: { name: string; score: number | null; logoUrl: string | null; overallRecord: string | null };
  away: { name: string; score: number | null; logoUrl: string | null; overallRecord: string | null };
}

function formatGameTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

interface Standing {
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
  team: { id: number; name: string; abbreviation: string; logoUrl?: string | null };
}

interface StandingsResponse {
  conferences: { conferenceName: string; standings: Standing[] }[];
}

interface NewsArticle {
  id: number;
  headline: string;
  url: string | null;
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

async function fetchHeadlines(): Promise<NewsArticle[]> {
  const res = await fetch("/api/news?limit=6&type=HeadlineNews");
  if (!res.ok) throw new Error("Failed to load headlines");
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
  const { data: headlines, isLoading: headlinesLoading } = useQuery({
    queryKey: ["news", "headlines"],
    queryFn: fetchHeadlines,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          NBA <span className="text-accent">Stats</span>
        </h1>
        <p className="text-foreground/72">Scores, standings, and news in one place.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_2fr_1fr]">
        <div />

        <div className="space-y-6">
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
                  const isScheduled = game.statusName === "STATUS_SCHEDULED";

                  if (isScheduled) {
                    return (
                      <Link
                        key={game.espnId}
                        href={`/games/${game.espnId}`}
                        className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-muted"
                      >
                        <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5">
                          {[game.away, game.home].map((team, i) => (
                            <Fragment key={i}>
                              <CircularBadge src={team.logoUrl} alt="" size="sm" />
                              <span className="truncate text-sm font-semibold">{team.name}</span>
                              <span className="shrink-0 text-xs text-foreground/50">{team.overallRecord}</span>
                            </Fragment>
                          ))}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5 border-l border-border pl-3 text-xs text-foreground/60">
                          <span>{formatGameTime(game.date)}</span>
                          {game.spreadDetails && <span>{game.spreadDetails}</span>}
                        </div>
                      </Link>
                    );
                  }

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
                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                          <CircularBadge src={game.away.logoUrl} alt="" size="sm" />
                          <span className="truncate">{game.away.name}</span>
                        </span>
                        <span className="shrink-0 font-display text-lg font-extrabold tabular-nums">
                          {game.away.score ?? "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                          <CircularBadge src={game.home.logoUrl} alt="" size="sm" />
                          <span className="truncate">{game.home.name}</span>
                        </span>
                        <span className="shrink-0 font-display text-lg font-extrabold tabular-nums">
                          {game.home.score ?? "-"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </SectionCard>

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
                  <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/60">
                    {conf.conferenceName}
                  </h3>
                  <div className="space-y-1.5">
                    {conf.standings
                      .slice()
                      .sort((a, b) => (a.conferenceRank ?? 99) - (b.conferenceRank ?? 99))
                      .slice(0, 10)
                      .map((s, i) => (
                        <div key={s.team.id}>
                          {i === 6 && <div className="mb-1.5 border-t border-dashed border-border" />}
                          <Link
                            href={`/teams/${s.team.id}`}
                            className="flex items-center justify-between gap-2 text-sm hover:text-foreground"
                          >
                            <span className="flex items-center gap-2 truncate text-foreground/82">
                              <span className="w-4 shrink-0 text-right text-xs text-foreground/50">
                                {s.conferenceRank}
                              </span>
                              <CircularBadge src={s.team.logoUrl} alt="" size="xs" />
                              <span className="truncate">{s.team.name}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-foreground/60">
                              {s.wins}-{s.losses}
                            </span>
                          </Link>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Top Headlines"
          accentColor="var(--accent)"
          action={
            <Link href="/news" className="text-sm font-semibold text-accent hover:underline">
              All news
            </Link>
          }
        >
          {headlinesLoading && <p className="text-foreground/72 text-sm">Loading…</p>}
          {!headlinesLoading && (!headlines || headlines.length === 0) && (
            <p className="text-foreground/72 text-sm">No headlines available.</p>
          )}
          <div className="divide-y divide-dashed divide-border">
            {headlines?.map((article) => (
              <a
                key={article.id}
                href={article.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block py-2.5 text-xs font-medium leading-snug line-clamp-2 hover:text-foreground/92"
              >
                {article.headline}
              </a>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
