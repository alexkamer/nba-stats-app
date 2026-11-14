"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, Suspense, useState } from "react";
import { CircularBadge } from "@/components/CircularBadge";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton, SkeletonRow, SkeletonGameCard } from "@/components/Skeleton";
import { useLayout } from "@/components/templates/layout-context";
import { isBreak, isUnderway } from "@/lib/game-status";
import { HOMES } from "@/components/templates/variants";

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

function shortenName(displayName: string): string {
  const parts = displayName.trim().split(" ");
  if (parts.length < 2) return displayName;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
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

interface LeagueLeader {
  displayName: string;
  headshotUrl: string | null;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  displayValue: string;
}

interface LeagueLeaderCategory {
  key: string;
  label: string;
  abbreviation: string;
  leaders: LeagueLeader[];
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

async function fetchLeagueLeaders(): Promise<LeagueLeaderCategory[]> {
  const res = await fetch("/api/league-leaders");
  if (!res.ok) throw new Error("Failed to load league leaders");
  const data = await res.json();
  return data.categories;
}

export default function HomePage() {
  const { layout, ready } = useLayout();
  const Variant = ready && layout !== "base" ? HOMES[layout] : undefined;
  if (Variant) return <Variant />;
  // Reading today's date would be evaluated during the server prerender
  // instead of per-visit (Next.js breaking change) unless deferred behind
  // Suspense — same pattern as the scoreboard page.
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

/** Mirrors HomeContent's grid shape so the initial Suspense fallback doesn't
 * cause a layout jump once data-driven content mounts in its place. */
function HomeSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_2fr_1fr]">
        <div className="space-y-2 rounded-md border border-border bg-surface p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
        <div className="space-y-6">
          <div className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonGameCard key={i} />
            ))}
          </div>
          <div className="space-y-2 rounded-md border border-border bg-surface p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-md border border-border bg-surface p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
      </div>
    </div>
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
  const { data: leaderCategories, isLoading: leadersLoading } = useQuery({
    queryKey: ["league-leaders"],
    queryFn: fetchLeagueLeaders,
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
        <SectionCard title="League Leaders" accentColor="var(--accent)">
          {leadersLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}
          <div className="space-y-5">
            {leaderCategories?.map((category) => (
              <div key={category.key}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground/60">
                  {category.label} ({category.abbreviation})
                </h3>
                <div className="space-y-2">
                  {category.leaders.map((leader, i) => (
                    <div key={leader.displayName} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <span className="w-4 shrink-0 text-right text-xs text-foreground/50">{i + 1}</span>
                        <CircularBadge src={leader.headshotUrl} alt="" size="xs" />
                        <span className="truncate font-semibold text-foreground">{shortenName(leader.displayName)}</span>
                        {leader.teamAbbreviation && (
                          <span className="shrink-0 text-xs font-medium text-foreground/60">
                            {leader.teamAbbreviation}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-foreground">
                        {leader.displayValue}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

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
            {gamesLoading && (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonGameCard key={i} />
                ))}
              </div>
            )}
            {!gamesLoading && (!games || games.length === 0) && (
              <p className="text-foreground/72 text-sm">No games scheduled today.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {games
                ?.slice()
                .sort(
                  (a, b) =>
                    Number(isUnderway(b.statusName)) - Number(isUnderway(a.statusName)),
                )
                .slice(0, 6)
                .map((game) => {
                  const isLive = isUnderway(game.statusName);
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
                        {isLive && !isBreak(game.statusName) ? `Q${game.period} ${game.clock ?? ""}` : game.statusDetail}
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
            {standingsLoading && (
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1].map((col) => (
                  <div key={col} className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </div>
                ))}
              </div>
            )}
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
          {headlinesLoading && (
            <div className="space-y-2.5 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
          )}
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
