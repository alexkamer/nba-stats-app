"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

interface Standing {
  id: number;
  conferenceRank: number | null;
  divisionRank: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  team: {
    id: number;
    displayName: string;
    abbreviation: string;
    division: { name: string; conference: { name: string } } | null;
  };
}

interface SeasonInfo {
  id: number;
  year: number;
  type: string;
}

interface StandingsResponse {
  season: SeasonInfo | null;
  availableSeasons: SeasonInfo[];
  conferences: { conferenceName: string; standings: Standing[] }[];
}

type ViewMode = "conference" | "division";

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

async function fetchStandings(year: number | null): Promise<StandingsResponse> {
  const url = year ? `/api/standings?year=${year}` : "/api/standings";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load standings");
  return res.json();
}

export default function StandingsPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("conference");
  const { data, isLoading, error } = useQuery({
    queryKey: ["standings", selectedYear],
    queryFn: () => fetchStandings(selectedYear),
  });

  // Division grouping is derived client-side — the API already returns
  // each team's division on every standing row, so no extra request needed.
  const divisionGroups = useMemo(() => {
    if (!data) return [];
    const allStandings = data.conferences.flatMap((c) => c.standings);
    const byDivision = new Map<string, Standing[]>();
    for (const s of allStandings) {
      const name = s.team.division?.name ?? "Unknown";
      const group = byDivision.get(name) ?? [];
      group.push(s);
      byDivision.set(name, group);
    }
    return Array.from(byDivision.entries())
      .map(([name, standings]) => ({
        groupName: `${standings[0]?.team.division?.conference.name ?? ""} — ${name}`,
        standings,
      }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [data]);

  if (isLoading) return <p className="text-neutral-400">Loading standings…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load standings.</p>;

  const groups =
    viewMode === "conference"
      ? data.conferences.map((c) => ({ groupName: c.conferenceName, standings: c.standings }))
      : divisionGroups;
  const rankField = viewMode === "conference" ? "conferenceRank" : "divisionRank";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">
          Standings
          {data.season && <span className="text-neutral-500 text-base ml-2">{seasonLabel(data.season.year)}</span>}
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-neutral-800 overflow-hidden text-sm">
            {(["conference", "division"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 capitalize ${
                  viewMode === mode ? "bg-neutral-800 text-neutral-100" : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          {data.availableSeasons.length > 0 && (
            <select
              value={data.season?.year ?? ""}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            >
              {data.availableSeasons.map((s) => (
                <option key={s.year} value={s.year}>
                  {seasonLabel(s.year)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className={viewMode === "conference" ? "grid md:grid-cols-2 gap-8" : "grid md:grid-cols-2 lg:grid-cols-3 gap-8"}>
        {groups.map((group) => (
          <section key={group.groupName}>
            <h2 className="text-lg font-medium text-neutral-300 mb-3">{group.groupName}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-800">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Team</th>
                  <th className="py-2 pr-2 text-right">W</th>
                  <th className="py-2 pr-2 text-right">L</th>
                  <th className="py-2 pr-2 text-right">PCT</th>
                  <th className="py-2 pr-2 text-right">GB</th>
                  <th className="py-2 text-right">Streak</th>
                </tr>
              </thead>
              <tbody>
                {group.standings
                  .slice()
                  .sort((a, b) => (a[rankField] ?? 0) - (b[rankField] ?? 0))
                  .map((s) => (
                    <tr key={s.id} className="border-b border-neutral-900">
                      <td className="py-2 pr-2 text-neutral-500">{s[rankField]}</td>
                      <td className="py-2 pr-2">
                        <Link href={`/teams/${s.team.id}`} className="hover:text-neutral-100">
                          {s.team.displayName}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-right">{s.wins}</td>
                      <td className="py-2 pr-2 text-right">{s.losses}</td>
                      <td className="py-2 pr-2 text-right">{s.winPct?.toFixed(3)}</td>
                      <td className="py-2 pr-2 text-right">{s.gamesBehind}</td>
                      <td className="py-2 text-right">{s.streak}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
