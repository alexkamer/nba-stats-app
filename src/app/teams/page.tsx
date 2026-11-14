"use client";

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { AlertCircle } from "lucide-react";
import { TeamPerformanceLeaderboard } from "@/components/TeamPerformanceLeaderboard";
import { getTeamAccent } from "@/lib/team-accent";
import { Skeleton } from "@/components/Skeleton";
import { TeamsListA } from "@/components/team/TeamsA";

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

  const theme = resolvedTheme === "dark" ? "dark" : "light";
  return <TeamsListA teams={teams} accentFor={(t) => getTeamAccent(teams.find((x) => x.id === t.id)?.color ?? null, theme).accent} leaderboard={<TeamPerformanceLeaderboard />} />;
}
