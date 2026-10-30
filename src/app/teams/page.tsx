"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

interface Team {
  id: number;
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
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
      <h1 className="text-2xl font-semibold">Teams</h1>
      {Array.from(byConference.entries()).map(([conference, confTeams]) => (
        <section key={conference}>
          <h2 className="text-lg font-medium text-foreground/92 mb-3">{conference}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {confTeams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 hover:border-accent transition-colors"
              >
                {team.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images, not optimizing
                  <img src={team.logoUrl} alt={team.displayName} className="h-10 w-10" />
                )}
                <span className="text-sm text-center">{team.displayName}</span>
                <span className="text-xs text-foreground/72">{team.division?.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
