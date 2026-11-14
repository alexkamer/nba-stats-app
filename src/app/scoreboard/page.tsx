"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useState } from "react";
import { getTeamAccent } from "@/lib/team-accent";
import { ScoreboardA } from "@/components/scoreboard/ScoreboardA";

interface GameCard {
  espnId: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; moneyline: number | null; lineScore: string[]; overallRecord: string | null; splitRecord: string | null };
  away: { abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; moneyline: number | null; lineScore: string[]; overallRecord: string | null; splitRecord: string | null };
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
    <ScoreboardA
      date={date}
      setDate={setDate}
      shiftDay={shiftDay}
      games={games}
      loading={isLoading}
      error={!!error}
      accentFor={(g) => getTeamAccent(g.home.color, theme).accent}
    />
  );
}
