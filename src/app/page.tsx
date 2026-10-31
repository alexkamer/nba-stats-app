"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CircularBadge } from "@/components/CircularBadge";

interface GameCard {
  espnId: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null };
  away: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null };
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

export default function Home() {
  return (
    <Suspense fallback={<p className="text-foreground/82">Loading…</p>}>
      <ScoreboardGate />
    </Suspense>
  );
}

// A client-side nav to "/" with a new ?date= (e.g. from the research page's
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Scoreboard</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => shiftDay(-1)} className="text-foreground/82 hover:text-foreground">
            ← Prev
          </button>
          <span className="text-foreground/92">{fromYyyymmdd(date).toLocaleDateString()}</span>
          <button onClick={() => shiftDay(1)} className="text-foreground/82 hover:text-foreground">
            Next →
          </button>
          <button onClick={() => setDate(toYyyymmdd(new Date()))} className="text-foreground/72 hover:text-foreground text-sm">
            Today
          </button>
        </div>
      </div>

      {isLoading && <p className="text-foreground/82">Loading…</p>}
      {error && <p className="text-red-600 dark:text-red-400">Failed to load scoreboard.</p>}
      {games && games.length === 0 && <p className="text-foreground/72">No games on this date.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {games?.map((game) => {
          const isLive = game.statusName === "STATUS_IN_PROGRESS";
          return (
            <Link
              key={game.espnId}
              href={`/games/${game.espnId}`}
              className="group relative overflow-hidden rounded-lg bg-surface-muted p-4 space-y-2.5 transition-transform hover:-translate-y-0.5"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-15 transition-opacity group-hover:opacity-25"
                style={{
                  background: `linear-gradient(135deg, ${game.away.color ?? "var(--color-accent)"}, ${game.home.color ?? "var(--color-accent)"})`,
                }}
              />
              <div className="relative flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <CircularBadge src={game.away.logoUrl} alt="" size="sm" />
                  {game.away.abbreviation}
                </span>
                <span className="font-display text-xl font-extrabold tabular-nums">{game.away.score ?? "-"}</span>
              </div>
              <div className="relative flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <CircularBadge src={game.home.logoUrl} alt="" size="sm" />
                  {game.home.abbreviation}
                </span>
                <span className="font-display text-xl font-extrabold tabular-nums">{game.home.score ?? "-"}</span>
              </div>
              <div className="relative flex items-center gap-1.5 pt-1.5 text-xs font-medium text-foreground/60">
                {isLive && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
                {isLive ? `Q${game.period} ${game.clock ?? ""}` : game.statusDetail}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
