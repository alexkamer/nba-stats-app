"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useState } from "react";

interface GameCard {
  espnId: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { abbreviation: string; displayName: string; score: number | null };
  away: { abbreviation: string; displayName: string; score: number | null };
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
    <Suspense fallback={<p className="text-foreground/60">Loading…</p>}>
      <ScoreboardContent />
    </Suspense>
  );
}

function ScoreboardContent() {
  // "Today" is the viewer's local date (SPEC.md Sec 9.3) — computed in the
  // browser, not guessed server-side.
  const [date, setDate] = useState(() => toYyyymmdd(new Date()));
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
        <h1 className="text-2xl font-semibold">Scoreboard</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => shiftDay(-1)} className="text-foreground/60 hover:text-foreground">
            ← Prev
          </button>
          <span className="text-foreground/80">{fromYyyymmdd(date).toLocaleDateString()}</span>
          <button onClick={() => shiftDay(1)} className="text-foreground/60 hover:text-foreground">
            Next →
          </button>
          <button onClick={() => setDate(toYyyymmdd(new Date()))} className="text-foreground/50 hover:text-foreground text-sm">
            Today
          </button>
        </div>
      </div>

      {isLoading && <p className="text-foreground/60">Loading…</p>}
      {error && <p className="text-red-600 dark:text-red-400">Failed to load scoreboard.</p>}
      {games && games.length === 0 && <p className="text-foreground/50">No games on this date.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {games?.map((game) => (
          <Link
            key={game.espnId}
            href={`/games/${game.espnId}`}
            className="rounded-lg border border-border bg-surface p-4 hover:border-accent space-y-2"
          >
            <div className="flex items-center justify-between text-sm">
              <span>{game.away.abbreviation}</span>
              <span className="font-medium">{game.away.score ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{game.home.abbreviation}</span>
              <span className="font-medium">{game.home.score ?? "-"}</span>
            </div>
            <div className="text-xs text-foreground/50 pt-1 border-t border-border">
              {game.statusName === "STATUS_IN_PROGRESS" ? `Q${game.period} ${game.clock ?? ""}` : game.statusDetail}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
