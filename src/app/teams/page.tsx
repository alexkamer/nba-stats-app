"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTheme } from "next-themes";
import { AlertCircle } from "lucide-react";
import { TeamPerformanceLeaderboard } from "@/components/TeamPerformanceLeaderboard";
import { getTeamAccent } from "@/lib/team-accent";
import { Skeleton } from "@/components/Skeleton";

interface Team {
  id: number;
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
  color: string | null;
  alternateColor: string | null;
  division: { name: string; conference: { name: string } } | null;
}

async function fetchTeams(): Promise<Team[]> {
  const res = await fetch("/api/teams");
  if (!res.ok) throw new Error("Failed to load teams");
  const data = await res.json();
  return data.teams;
}

export default function TeamsPage() {
  const { resolvedTheme } = useTheme();
  const { data: teams, isLoading, error } = useQuery({ queryKey: ["teams"], queryFn: fetchTeams });

  if (isLoading)
    return (
      <div className="space-y-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Teams</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  if (error)
    return (
      <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="h-4 w-4" /> Failed to load teams.
      </p>
    );
  if (!teams) return null;

  const byConference = new Map<string, Team[]>();
  for (const team of teams) {
    const key = team.division?.conference.name ?? "Unknown";
    const group = byConference.get(key) ?? [];
    group.push(team);
    byConference.set(key, group);
  }

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Teams</h1>
      <TeamPerformanceLeaderboard />
      {Array.from(byConference.entries()).map(([conference, confTeams]) => (
        <section key={conference}>
          <h2 className="text-lg font-medium text-foreground/92 mb-3">{conference}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {confTeams.map((team) => {
              const theme = resolvedTheme === "dark" ? "dark" : "light";
              const primary = getTeamAccent(team.color, theme).accent;
              const secondary = team.alternateColor ? getTeamAccent(team.alternateColor, theme).accent : primary;
              return (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="group relative flex flex-col items-center gap-2 overflow-hidden rounded-lg border border-border bg-surface-muted p-4 transition-all hover:-translate-y-0.5 hover:border-accent"
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-10 transition-opacity group-hover:opacity-20"
                    style={{ background: `linear-gradient(145deg, ${primary}, ${secondary})` }}
                  />
                  {team.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images, not optimizing
                    <img src={team.logoUrl} alt={team.displayName} className="relative h-14 w-14 object-contain" />
                  )}
                  <span className="relative text-sm font-semibold text-center">{team.displayName}</span>
                  <span className="relative text-xs text-foreground/60">{team.division?.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
