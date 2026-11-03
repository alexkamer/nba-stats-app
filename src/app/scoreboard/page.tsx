"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useState } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, CalendarX } from "lucide-react";
import { CircularBadge } from "@/components/CircularBadge";
import { getTeamAccent } from "@/lib/team-accent";
import { Skeleton } from "@/components/Skeleton";

interface GameCard {
  espnId: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; moneyline: number | null; lineScore: string[]; overallRecord: string | null; splitRecord: string | null };
  away: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; moneyline: number | null; lineScore: string[]; overallRecord: string | null; splitRecord: string | null };
}

function formatMoneyline(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 ? `+${value}` : `${value}`;
}

function formatRecord(overallRecord: string | null, splitRecord: string | null, splitLabel: string): string | null {
  if (!overallRecord) return null;
  return splitRecord ? `${overallRecord} (${splitRecord} ${splitLabel})` : overallRecord;
}

function toYyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function fromYyyymmdd(value: string): Date {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00`);
}

async function fetchScoreboard(date: string): Promise<GameCard[]> {
  const res = await fetch(`/api/scoreboard?date=${date}`);
  if (!res.ok) throw new Error("Failed to load scoreboard");
  const data = await res.json();
  return data.games;
}

export default function ScoreboardPage() {
  return (
    <Suspense fallback={<p className="text-foreground/82">Loading…</p>}>
      <ScoreboardGate />
    </Suspense>
  );
}

// A client-side nav to "/scoreboard" with a new ?date= (e.g. from the research page's
// game log) reuses the already-mounted ScoreboardContent, so a useState
// initializer there wouldn't rerun — keying on the param forces a remount
// instead, which re-seeds ScoreboardContent's own date state from scratch.
function ScoreboardGate() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const initialDate = dateParam && /^\d{8}$/.test(dateParam) ? dateParam : null;
  return <ScoreboardContent key={initialDate ?? "today"} initialDate={initialDate} />;
}

function ScoreboardContent({ initialDate }: { initialDate: string | null }) {
  // "Today" is the viewer's local date (SPEC.md Sec 9.3) — computed in the
  // browser, not guessed server-side — unless a deep link requested a
  // specific date (see ScoreboardGate).
  const [date, setDate] = useState(() => initialDate ?? toYyyymmdd(new Date()));
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const { data: games, isLoading, error } = useQuery({
    queryKey: ["scoreboard", date],
    queryFn: () => fetchScoreboard(date),
  });

  function shiftDay(delta: number) {
    const d = fromYyyymmdd(date);
    d.setDate(d.getDate() + delta);
    setDate(toYyyymmdd(d));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          Score<span className="text-accent">board</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1">
            <button
              onClick={() => shiftDay(-1)}
              aria-label="Previous day"
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <span className="min-w-36 text-center font-display text-base font-bold tabular-nums">
              {fromYyyymmdd(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <button
              onClick={() => shiftDay(1)}
              aria-label="Next day"
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
          <button
            onClick={() => setDate(toYyyymmdd(new Date()))}
            className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Today
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-l-[3px] border-l-border px-2 py-4">
              <div className="flex flex-1 flex-col gap-2">
                {[0, 1].map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="ml-auto h-6 w-8" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" /> Failed to load scoreboard.
        </p>
      )}
      {games && games.length === 0 && (
        <p className="flex items-center gap-2 text-foreground/72">
          <CalendarX className="h-4 w-4" /> No games on this date.
        </p>
      )}

      <div className="divide-y divide-border">
        {games?.map((game) => {
          const isLive = game.statusName === "STATUS_IN_PROGRESS";
          const isFinal = game.statusName === "STATUS_FINAL";
          const isScheduled = game.statusName === "STATUS_SCHEDULED";
          const awayWon = isFinal && game.away.score != null && game.home.score != null && game.away.score > game.home.score;
          const homeWon = isFinal && game.away.score != null && game.home.score != null && game.home.score > game.away.score;
          const awayMoneyline = formatMoneyline(game.away.moneyline);
          const homeMoneyline = formatMoneyline(game.home.moneyline);
          const awayRecord = formatRecord(game.away.overallRecord, game.away.splitRecord, "Away");
          const homeRecord = formatRecord(game.home.overallRecord, game.home.splitRecord, "Home");
          const periods = isScheduled ? 0 : Math.max(4, game.away.lineScore.length, game.home.lineScore.length);
          const periodLabels = Array.from({ length: periods }, (_, i) => (i < 4 ? `${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ""}`));
          const gridTemplateColumns = periods > 0 ? `1fr ${"1.25rem ".repeat(periods)}1rem 3rem` : "1fr 3rem";
          const homeAccent = getTeamAccent(game.home.color, theme).accent;
          return (
            <div
              key={game.espnId}
              className="group flex items-center gap-4 border-l-[3px] px-2 py-4 transition-colors hover:bg-surface-muted"
              style={{ borderLeftColor: homeAccent }}
            >
              <Link href={`/games/${game.espnId}`} className="flex flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground/60">
                  {isLive && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
                  {isLive ? `Q${game.period} ${game.clock ?? ""}` : game.statusDetail}
                </span>
                <div className="grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns }}>
                  {periods > 0 && (
                    <>
                      <span />
                      {periodLabels.map((label, i) => (
                        <span key={i} className="text-right text-[10px] font-medium text-foreground/50">
                          {label}
                        </span>
                      ))}
                      <span />
                      <span />
                    </>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${isFinal && !awayWon ? "text-foreground/40" : ""}`}>
                      <CircularBadge src={game.away.logoUrl} alt="" size="sm" />
                      <span className="truncate">
                        <span className="sm:hidden">{game.away.abbreviation}</span>
                        <span className="hidden sm:inline">{game.away.displayName}</span>
                      </span>
                      {isScheduled && awayMoneyline && <span className="shrink-0 font-normal text-foreground/50">({awayMoneyline})</span>}
                    </span>
                    {awayRecord && <span className="truncate pl-7 text-xs font-normal text-foreground/50">{awayRecord}</span>}
                  </span>
                  {periodLabels.map((_, i) => (
                    <span key={i} className="text-right text-xs tabular-nums text-foreground/50">
                      {game.away.lineScore[i] ?? "-"}
                    </span>
                  ))}
                  {periods > 0 && <span />}
                  <span className={`text-right font-display text-2xl tabular-nums font-extrabold ${isFinal && !awayWon ? "text-foreground/40" : "text-foreground"}`}>
                    {game.away.score ?? "-"}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${isFinal && !homeWon ? "text-foreground/40" : ""}`}>
                      <CircularBadge src={game.home.logoUrl} alt="" size="sm" />
                      <span className="truncate">
                        <span className="sm:hidden">{game.home.abbreviation}</span>
                        <span className="hidden sm:inline">{game.home.displayName}</span>
                      </span>
                      {isScheduled && homeMoneyline && <span className="shrink-0 font-normal text-foreground/50">({homeMoneyline})</span>}
                    </span>
                    {homeRecord && <span className="truncate pl-7 text-xs font-normal text-foreground/50">{homeRecord}</span>}
                  </span>
                  {periodLabels.map((_, i) => (
                    <span key={i} className="text-right text-xs tabular-nums text-foreground/50">
                      {game.home.lineScore[i] ?? "-"}
                    </span>
                  ))}
                  {periods > 0 && <span />}
                  <span className={`text-right font-display text-2xl tabular-nums font-extrabold ${isFinal && !homeWon ? "text-foreground/40" : "text-foreground"}`}>
                    {game.home.score ?? "-"}
                  </span>
                </div>
              </Link>
              <div className="w-0.5 shrink-0 self-stretch bg-foreground/15" />
              <div className="flex shrink-0 flex-col items-start gap-2 text-xs font-medium text-foreground/60">
                <Link href={`/games/${game.espnId}?tab=gamecast`} className="hover:text-foreground">
                  Gamecast
                </Link>
                <Link href={`/games/${game.espnId}?tab=boxscore`} className="hover:text-foreground">
                  Box Score
                </Link>
                <Link href={`/games/${game.espnId}?tab=playbyplay`} className="hover:text-foreground">
                  Play-by-Play
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
