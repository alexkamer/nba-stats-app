"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ShieldHalf } from "lucide-react";
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

// Canonical division order so the 3x2 grid lays out as East's three
// divisions on top and West's three underneath, regardless of the order
// divisions happen to appear in the API response.
const DIVISION_ORDER = ["Atlantic", "Central", "Southeast", "Northwest", "Pacific", "Southwest"];

/** Hover-revealed "Teams" menu for the desktop TopBar — groups teams by
 * division in a 3-column, 2-row grid instead of just linking to the full
 * Teams page, so a division can be reached in one hover + click. Teams
 * share the "teams" query key with the Teams page, so visiting either
 * warms the other's cache. */
export function TeamsNavMenu() {
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: fetchTeams });

  const byDivision = new Map<string, Team[]>();
  for (const team of teams ?? []) {
    const division = team.division?.name ?? "Unknown";
    const divisionGroup = byDivision.get(division) ?? [];
    divisionGroup.push(team);
    byDivision.set(division, divisionGroup);
  }
  const divisions = Array.from(byDivision.entries()).sort(
    ([a], [b]) => DIVISION_ORDER.indexOf(a) - DIVISION_ORDER.indexOf(b),
  );

  return (
    <div className="group relative">
      <Link href="/teams" className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground">
        <ShieldHalf className="h-4 w-4" strokeWidth={1.75} />
        Teams
      </Link>
      <div
        className="invisible absolute left-0 top-full z-20 pt-3 opacity-0 transition-opacity
          group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <div className="grid w-max grid-cols-3 gap-x-6 gap-y-5 rounded-lg border border-border bg-surface p-4 shadow-lg">
          {divisions.map(([division, divisionTeams]) => (
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
    </div>
  );
}
