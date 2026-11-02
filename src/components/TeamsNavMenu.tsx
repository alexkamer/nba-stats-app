"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";

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

/** Hover-revealed "Teams" menu for the desktop TopBar — groups teams by
 * division (nested under conference) instead of just linking to the full
 * Teams page, so a division can be reached in one hover + click. Teams
 * share the "teams" query key with the Teams page, so visiting either
 * warms the other's cache. */
export function TeamsNavMenu() {
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: fetchTeams });

  const byConference = new Map<string, Map<string, Team[]>>();
  for (const team of teams ?? []) {
    const conference = team.division?.conference.name ?? "Unknown";
    const division = team.division?.name ?? "Unknown";
    const conferenceGroup = byConference.get(conference) ?? new Map<string, Team[]>();
    const divisionGroup = conferenceGroup.get(division) ?? [];
    divisionGroup.push(team);
    conferenceGroup.set(division, divisionGroup);
    byConference.set(conference, conferenceGroup);
  }

  return (
    <div className="group relative">
      <Link href="/teams" className="text-foreground/70 hover:text-foreground">
        Teams
      </Link>
      <div
        className="invisible absolute left-0 top-full z-20 pt-3 opacity-0 transition-opacity
          group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <div className="flex gap-6 rounded-lg border border-border bg-surface p-4 shadow-lg">
          {Array.from(byConference.entries()).map(([conference, divisions]) => (
            <div key={conference} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/60">{conference}</h3>
              <div className="space-y-3">
                {Array.from(divisions.entries()).map(([division, divisionTeams]) => (
                  <div key={division} className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold text-foreground/50">{division}</h4>
                    <div className="space-y-1">
                      {divisionTeams.map((team) => (
                        <Link
                          key={team.id}
                          href={`/teams/${team.id}`}
                          className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground/82 hover:text-foreground"
                        >
                          <CircularBadge src={team.logoUrl} alt="" size="xs" />
                          {team.abbreviation}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
