"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";

interface TeamSummary {
  id: number;
  abbreviation: string;
  logoUrl: string | null;
}

interface PlayerSummary {
  id: number;
  espnId: string;
  displayName: string;
  headshotUrl: string | null;
}

interface LeaderboardEntry {
  player: PlayerSummary;
  team: TeamSummary;
  points: number;
  rebounds: number;
  assists: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
  game: {
    espnId: string;
    isHome: boolean;
    teamScore: number | null;
    teamAbbreviation: string;
    teamLogoUrl: string | null;
    opponentScore: number | null;
    opponentAbbreviation: string;
    opponentLogoUrl: string | null;
  };
}

async function fetchLeaderboard(date: string): Promise<{ date: string; leaderboard: LeaderboardEntry[] }> {
  const res = await fetch(`/api/betting/history/daily-leaderboard?date=${date}`);
  if (!res.ok) throw new Error("Failed to load daily leaderboard");
  return res.json();
}

// useParams requires a Suspense boundary so this route can still be
// prerendered up to it (see Next's "blocking-prerender-client-hook" guidance).
export default function KingOfTheCourtDayPage() {
  return (
    <Suspense fallback={<p className="text-foreground/82">Loading…</p>}>
      <KingOfTheCourtDayContent />
    </Suspense>
  );
}

function KingOfTheCourtDayContent() {
  const { date } = useParams<{ date: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["betting", "history", "daily-leaderboard", date],
    queryFn: () => fetchLeaderboard(date),
    enabled: Boolean(date),
  });

  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : date;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/betting/history" className="text-sm text-accent hover:underline">
          ← Back to Cover Story
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">King of the Court — {formattedDate}</h1>
        <p className="text-foreground/72 text-sm mt-1">Top 25 by combined points+rebounds+assists that day.</p>
      </div>

      {isLoading && <p className="text-foreground/72">Loading leaderboard…</p>}
      {error && <p className="text-red-600 dark:text-red-400">Failed to load this day&apos;s leaderboard.</p>}
      {data && data.leaderboard.length === 0 && (
        <p className="text-foreground/72">No games were played on this date.</p>
      )}

      {data && data.leaderboard.length > 0 && (
        <table className="w-full max-w-3xl border-collapse text-sm">
          <thead>
            <tr className="text-left text-foreground/72">
              <th className="pb-2 font-normal">#</th>
              <th className="pb-2 font-normal">Player</th>
              <th className="pb-2 text-right font-normal">PTS</th>
              <th className="pb-2 text-right font-normal">REB</th>
              <th className="pb-2 text-right font-normal">AST</th>
              <th className="pb-2 text-right font-normal">PRA</th>
              <th className="pb-2 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((entry, i) => (
              <tr key={entry.player.id} className="border-t border-border/60">
                <td className="py-1.5 text-foreground/60 tabular-nums">{i + 1}</td>
                <td className="py-1.5">
                  <Link href={`/players/${entry.player.id}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                    <CircularBadge src={entry.player.headshotUrl} alt="" size="sm" />
                    {entry.player.displayName}
                  </Link>
                </td>
                <td className="py-1.5 text-right tabular-nums text-foreground/72">{entry.points}</td>
                <td className="py-1.5 text-right tabular-nums text-foreground/72">{entry.rebounds}</td>
                <td className="py-1.5 text-right tabular-nums text-foreground/72">{entry.assists}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{entry.pointsReboundsAssists}</td>
                <td className="py-1.5 text-right">
                  <Link
                    href={`/games/${entry.game.espnId}`}
                    className="inline-flex items-center gap-1.5 tabular-nums text-foreground/72 hover:text-accent hover:underline"
                  >
                    <CircularBadge src={entry.game.teamLogoUrl} alt="" size="xs" />
                    {entry.game.teamAbbreviation} {entry.game.teamScore ?? "—"}
                    <span className="text-foreground/50">{entry.game.isHome ? "vs" : "@"}</span>
                    {entry.game.opponentScore ?? "—"} {entry.game.opponentAbbreviation}
                    <CircularBadge src={entry.game.opponentLogoUrl} alt="" size="xs" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
