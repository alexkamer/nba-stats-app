"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TeamPerformanceLeaderboard } from "@/components/TeamPerformanceLeaderboard";

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
  const { data: teams, isLoading, error } = useQuery({ queryKey: ["teams"], queryFn: fetchTeams });

  if (isLoading) return <p className="text-foreground/82">Loading teams…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load teams.</p>;
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
              const primary = team.color ? `#${team.color}` : "var(--color-accent)";
              const secondary = team.alternateColor ? `#${team.alternateColor}` : primary;
              return (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="group relative flex flex-col items-center gap-2 overflow-hidden rounded-lg bg-surface-muted p-4 transition-transform hover:-translate-y-0.5"
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
