"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AverageLabelPill,
  formatMargin,
  marginColorClass,
  type AverageLabelValue,
} from "@/components/performance-display";

interface LeaderboardEntry {
  rank: number;
  team: { id: number; displayName: string; abbreviation: string; logoUrl: string | null };
  averageCoverMargin: number;
  games: number;
  label: AverageLabelValue;
}

interface LeaderboardResponse {
  year: number;
  teams: LeaderboardEntry[];
}

async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch("/api/teams/performance");
  if (!res.ok) throw new Error("Failed to load team performance");
  return res.json();
}

/** League-wide ranking of teams by average cover margin: who is beating or
 * missing the market's expectation. Each row links to that team's
 * Performance tab. */
export function TeamPerformanceLeaderboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["teamPerformanceLeaderboard"], queryFn: fetchLeaderboard });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-medium text-foreground/92">Over- and underperformers</h2>
        <p className="text-sm text-foreground/72">
          Average points a team finishes above or below the spread this regular season.
        </p>
      </div>

      {isLoading && <p className="text-sm text-foreground/82">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Failed to load team performance.</p>}
      {data && data.teams.length === 0 && (
        <p className="text-sm text-foreground/72">No team performance data is available yet this season.</p>
      )}

      {data && data.teams.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-left text-foreground/72">
                <th className="py-2 pl-3 pr-3 w-12">#</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3 text-right">Avg vs. spread</th>
                <th className="py-2 pr-3 pl-4">Verdict</th>
                <th className="py-2 pr-3 text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((entry) => (
                <tr key={entry.team.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pl-3 pr-3 text-foreground/72">{entry.rank}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/teams/${entry.team.id}?tab=performance`} className="flex items-center gap-2 hover:text-foreground">
                      {entry.team.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images, not optimizing
                        <img src={entry.team.logoUrl} alt="" className="h-6 w-6 object-contain" />
                      )}
                      <span className="font-medium">{entry.team.displayName}</span>
                    </Link>
                  </td>
                  <td className={`py-2 pr-3 text-right font-semibold ${marginColorClass(entry.averageCoverMargin)}`}>
                    {formatMargin(entry.averageCoverMargin)}
                  </td>
                  <td className="py-2 pr-3 pl-4">
                    <AverageLabelPill label={entry.label} />
                  </td>
                  <td className="py-2 pr-3 text-right text-foreground/72">{entry.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
