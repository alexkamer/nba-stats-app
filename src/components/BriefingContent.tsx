"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CircularBadge } from "@/components/CircularBadge";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton, SkeletonRow } from "@/components/Skeleton";
import { useBreadcrumbLabel } from "@/components/Breadcrumb";
import { useLayout } from "@/components/templates/layout-context";
import { BriefingC } from "@/components/templates/variants/c/BriefingC";

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface TeamRef {
  id: number;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}
export interface FinalGame {
  id: number;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
}
export interface DailyLeaderEntry {
  playerId: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
  player: { id: number; displayName: string; headshotUrl: string | null };
}
export interface TopScorer {
  playerId: number;
  points: number;
  player: { id: number; displayName: string; headshotUrl: string | null };
  team: { id: number; abbreviation: string } | null;
}
interface Headline {
  id: number;
  headline: string;
  url: string | null;
}
export interface StandingsRow {
  conferenceName: string;
  team: TeamRef;
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
}
export interface InjuryRow {
  playerId: number;
  status: string;
  player: { id: number; displayName: string };
  team: { id: number; abbreviation: string } | null;
}
export interface ScheduleGame {
  id: number;
  date: string;
  status: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  pick: { projectedHomeScore: number; projectedAwayScore: number; projectedMargin: number } | null;
  market: { spread: number | null; overUnder: number | null } | null;
}
export interface BestBetPick {
  rank: number;
  statType: string;
  player: { id: number; displayName: string; headshotUrl: string | null };
  line: number | null;
  lean: "OVER" | "UNDER" | null;
  gradedCorrect: boolean | null;
}
export interface BriefingPayload {
  date: string;
  isToday: boolean;
  nextDate: string | null;
  prevDate: string | null;
  summary: string | null;
  yesterdaysScores: { date: string; games: FinalGame[] };
  topPerformers: { date: string; leaders: DailyLeaderEntry[]; topScorers: TopScorer[] };
  headlines: Headline[] | null;
  standings: StandingsRow[] | null;
  injuryReport: InjuryRow[] | null;
  schedule: ScheduleGame[] | null;
  pastSlate: { date: string; games: FinalGame[] } | null;
  bestBets: {
    date: string;
    picks: BestBetPick[] | null;
    priorDay: {
      date: string;
      picks: BestBetPick[] | null;
      record: { wins: number; losses: number; record: string } | null;
    };
  };
}

export async function fetchBriefing(dateKey: string | null): Promise<BriefingPayload> {
  const url = dateKey ? `/api/briefing?date=${dateKey}` : "/api/briefing";
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? "No briefing available for that date." : "Failed to load briefing");
  return res.json();
}

export const STAT_LABELS: Record<string, string> = {
  POINTS: "Points",
  REBOUNDS: "Rebounds",
  ASSISTS: "Assists",
  THREE_POINTERS_MADE: "3PM",
  STEALS: "Steals",
  BLOCKS: "Blocks",
  POINTS_ASSISTS: "Pts+Ast",
  POINTS_REBOUNDS: "Pts+Reb",
  REBOUNDS_ASSISTS: "Reb+Ast",
  POINTS_REBOUNDS_ASSISTS: "PRA",
  DOUBLE_DOUBLE: "Double-Double",
  TRIPLE_DOUBLE: "Triple-Double",
};

function BestBetsList({ picks, emptyMessage }: { picks: BestBetPick[] | null; emptyMessage: string }) {
  if (!picks || picks.length === 0) {
    return <p className="text-foreground/72 text-sm">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-1.5">
      {picks.map((p) => (
        <div key={`${p.player.id}-${p.statType}`} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 truncate">
            <CircularBadge src={p.player.headshotUrl} alt="" size="xs" />
            <span className="truncate">{p.player.displayName}</span>
            <span className="text-xs text-foreground/50">{STAT_LABELS[p.statType] ?? p.statType}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold">
            {p.lean} {p.line}
            {p.gradedCorrect !== null && (
              <span
                className={
                  p.gradedCorrect
                    ? "ml-1.5 text-emerald-600 dark:text-emerald-400"
                    : "ml-1.5 text-red-600 dark:text-red-400"
                }
              >
                {p.gradedCorrect ? "✓" : "✗"}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function GameLine({ game }: { game: FinalGame }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-2 truncate">
        <CircularBadge src={game.awayTeam.logoUrl} alt="" size="xs" />
        <span className="truncate">{game.awayTeam.name}</span>
        <span className="tabular-nums font-semibold text-foreground">{game.awayScore ?? "-"}</span>
      </span>
      <span className="text-foreground/40">@</span>
      <span className="flex min-w-0 items-center gap-2 truncate">
        <span className="tabular-nums font-semibold text-foreground">{game.homeScore ?? "-"}</span>
        <span className="truncate">{game.homeTeam.name}</span>
        <CircularBadge src={game.homeTeam.logoUrl} alt="" size="xs" />
      </span>
    </div>
  );
}

/** Single-column, date-scoped recap-and-preview page (daily-briefing-page)
 * — deliberately not a multi-column `SectionCard` grid like the home page,
 * since this reads top-to-bottom like a morning newsletter. `dateKey` is
 * `null` for `/briefing` (resolves to today client-side, same deferred-
 * today pattern as the home page) or an explicit `YYYY-MM-DD` for
 * `/briefing/[date]`. */
function BaselineBriefingContent({ dateKey: explicitDateKey }: { dateKey: string | null }) {
  const [resolvedToday] = useState(() => todayKey());
  const dateKey = explicitDateKey ?? resolvedToday;

  const { data, isLoading, error } = useQuery({
    queryKey: ["briefing", dateKey],
    queryFn: () => fetchBriefing(explicitDateKey),
  });

  useBreadcrumbLabel(data ? formatDateHeading(data.date) : null);

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Baseline Briefing</h1>
        <p className="text-foreground/72 text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Baseline Briefing</h1>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link
              href={data?.prevDate ? `/briefing/${data.prevDate}` : "#"}
              aria-label="Previous day"
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-foreground/70 hover:bg-surface-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            {data?.nextDate ? (
              <Link
                href={`/briefing/${data.nextDate}`}
                aria-label="Next day"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-foreground/70 hover:bg-surface-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            ) : (
              <span
                aria-hidden="true"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-foreground/25"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
              </span>
            )}
          </div>
        </div>
        {isLoading && <Skeleton className="h-4 w-56" />}
        {data && <p className="text-foreground/72">{formatDateHeading(data.date)}</p>}
        {data?.summary && <p className="text-sm font-medium text-foreground/82">{data.summary}</p>}
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-md border border-border bg-surface p-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <SkeletonRow key={j} />
              ))}
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <SectionCard title={`Scores — ${formatDateHeading(data.yesterdaysScores.date)}`} accentColor="var(--accent)">
            {data.yesterdaysScores.games.length === 0 ? (
              <p className="text-foreground/72 text-sm">No games were played that day.</p>
            ) : (
              <div className="divide-y divide-dashed divide-border">
                {data.yesterdaysScores.games.map((g) => (
                  <GameLine key={g.id} game={g} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Top Performers" accentColor="var(--accent)">
            {data.topPerformers.leaders.length === 0 && data.topPerformers.topScorers.length === 0 ? (
              <p className="text-foreground/72 text-sm">No performances recorded that day.</p>
            ) : (
              <div className="space-y-4">
                {data.topPerformers.leaders.length > 0 && (
                  <div className="space-y-1">
                    {data.topPerformers.leaders.map((l) => (
                      <div key={l.playerId} className="flex items-center gap-2 text-sm">
                        <CircularBadge src={l.player.headshotUrl} alt="" size="xs" />
                        <span className="font-semibold">{l.player.displayName}</span>
                        <span className="text-foreground/60">{l.pointsReboundsAssists} PRA</span>
                        {l.hadTripleDouble && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                            Triple-double
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {data.topPerformers.topScorers.length > 0 && (
                  <div>
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-foreground/60">
                      Top Scorers
                    </h3>
                    <div className="space-y-1">
                      {data.topPerformers.topScorers.map((s, i) => (
                        <div key={s.playerId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2 truncate">
                            <span className="w-4 text-right text-xs text-foreground/50">{i + 1}</span>
                            <CircularBadge src={s.player.headshotUrl} alt="" size="xs" />
                            <span className="truncate">{s.player.displayName}</span>
                            {s.team && <span className="text-xs text-foreground/50">{s.team.abbreviation}</span>}
                          </span>
                          <span className="tabular-nums font-semibold">{s.points}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {data.headlines !== null && (
            <SectionCard title="Headlines" accentColor="var(--accent)">
              {data.headlines.length === 0 ? (
                <p className="text-foreground/72 text-sm">No headlines available.</p>
              ) : (
                <div className="divide-y divide-dashed divide-border">
                  {data.headlines.map((a) => (
                    <a
                      key={a.id}
                      href={a.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-2 text-sm font-medium hover:text-foreground/92"
                    >
                      {a.headline}
                    </a>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {data.injuryReport !== null && (
            <SectionCard title="Injury Report — Tonight" accentColor="var(--accent)">
              {data.injuryReport.length === 0 ? (
                <p className="text-foreground/72 text-sm">No injury concerns reported for tonight&apos;s games.</p>
              ) : (
                <div className="space-y-1">
                  {data.injuryReport.map((r) => (
                    <div key={r.playerId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {r.player.displayName}
                        {r.team && <span className="ml-1 text-xs text-foreground/50">{r.team.abbreviation}</span>}
                      </span>
                      <span className="text-xs font-semibold text-foreground/70">{r.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {data.standings !== null && (
            <SectionCard title="Standings" accentColor="var(--accent)">
              {data.standings.length === 0 ? (
                <p className="text-foreground/72 text-sm">No standings available.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(
                    data.standings.reduce<Record<string, StandingsRow[]>>((acc, s) => {
                      (acc[s.conferenceName] ??= []).push(s);
                      return acc;
                    }, {}),
                  ).map(([conf, rows]) => (
                    <div key={conf} className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/60">{conf}</h3>
                      {rows
                        .slice()
                        .sort((a, b) => (a.conferenceRank ?? 99) - (b.conferenceRank ?? 99))
                        .slice(0, 10)
                        .map((s) => (
                          <div key={s.team.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-2 truncate">
                              <span className="w-4 text-right text-xs text-foreground/50">{s.conferenceRank}</span>
                              <CircularBadge src={s.team.logoUrl} alt="" size="xs" />
                              <span className="truncate">{s.team.name}</span>
                            </span>
                            <span className="tabular-nums text-foreground/60">
                              {s.wins}-{s.losses}
                            </span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {data.schedule !== null && (
            <SectionCard title="Tonight's Schedule" accentColor="var(--accent)">
              {data.schedule.length === 0 ? (
                <p className="text-foreground/72 text-sm">No games scheduled tonight.</p>
              ) : (
                <div className="space-y-3">
                  {data.schedule.map((g) => (
                    <div key={g.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <CircularBadge src={g.awayTeam.logoUrl} alt="" size="xs" />
                          {g.awayTeam.name} @ {g.homeTeam.name}
                          <CircularBadge src={g.homeTeam.logoUrl} alt="" size="xs" />
                        </span>
                      </div>
                      {(g.pick || g.market) && (
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-foreground/60">
                          {g.pick && (
                            <span>
                              Our pick: {g.pick.projectedAwayScore.toFixed(0)}-{g.pick.projectedHomeScore.toFixed(0)}
                            </span>
                          )}
                          {g.market?.spread != null && <span>Market spread: {g.market.spread}</span>}
                          {g.market?.overUnder != null && <span>O/U: {g.market.overUnder}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {data.pastSlate !== null && (
            <SectionCard title={`That Night's Games — ${formatDateHeading(data.pastSlate.date)}`} accentColor="var(--accent)">
              {data.pastSlate.games.length === 0 ? (
                <p className="text-foreground/72 text-sm">No games were played that night.</p>
              ) : (
                <div className="divide-y divide-dashed divide-border">
                  {data.pastSlate.games.map((g) => (
                    <GameLine key={g.id} game={g} />
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard
            title="Best Bets"
            accentColor="var(--accent)"
            action={
              <Link href="/betting" className="text-sm font-semibold text-accent hover:underline">
                Full insights
              </Link>
            }
          >
            <div className="space-y-5">
              <div>
                <h3 className="mb-1.5 flex items-baseline justify-between text-xs font-bold uppercase tracking-wide text-foreground/60">
                  <span>{formatDateHeading(data.bestBets.priorDay.date)}</span>
                  {data.bestBets.priorDay.record && (
                    <span className="font-semibold normal-case tracking-normal text-foreground/70">
                      {data.bestBets.priorDay.record.record}
                    </span>
                  )}
                </h3>
                <BestBetsList picks={data.bestBets.priorDay.picks} emptyMessage="No Best Bets selection available for that date." />
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-foreground/60">
                  {data.isToday ? "Tonight" : formatDateHeading(data.bestBets.date)}
                </h3>
                <BestBetsList picks={data.bestBets.picks} emptyMessage="No Best Bets selection available for this date." />
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

/** Draft switch: layout A renders the Briefing in variant C's quiet style
 * (see design D9); every other layout keeps the existing page. */
export function BriefingContent({ dateKey }: { dateKey: string | null }) {
  const { layout, ready } = useLayout();
  if (ready && layout === "a") return <BriefingC dateKey={dateKey} />;
  return <BaselineBriefingContent dateKey={dateKey} />;
}
