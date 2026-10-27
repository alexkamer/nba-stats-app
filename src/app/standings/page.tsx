"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

interface Standing {
  id: number;
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  team: { id: number; displayName: string; abbreviation: string; division: { name: string } | null };
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["standings", selectedYear],
    queryFn: () => fetchStandings(selectedYear),
  });

  if (isLoading) return <p className="text-neutral-400">Loading standings…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load standings.</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Standings
          {data.season && <span className="text-neutral-500 text-base ml-2">{seasonLabel(data.season.year)}</span>}
        </h1>
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
      <div className="grid md:grid-cols-2 gap-8">
        {data.conferences.map((conf) => (
          <section key={conf.conferenceName}>
            <h2 className="text-lg font-medium text-neutral-300 mb-3">{conf.conferenceName}</h2>
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
                {conf.standings
                  .sort((a, b) => (a.conferenceRank ?? 0) - (b.conferenceRank ?? 0))
                  .map((s) => (
                    <tr key={s.id} className="border-b border-neutral-900">
                      <td className="py-2 pr-2 text-neutral-500">{s.conferenceRank}</td>
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
