"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

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

interface StandingsResponse {
  season: { year: number; type: string } | null;
  conferences: { conferenceName: string; standings: Standing[] }[];
}

async function fetchStandings(): Promise<StandingsResponse> {
  const res = await fetch("/api/standings");
  if (!res.ok) throw new Error("Failed to load standings");
  return res.json();
}

export default function StandingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["standings"], queryFn: fetchStandings });

  if (isLoading) return <p className="text-neutral-400">Loading standings…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load standings.</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">
        Standings
        {data.season && (
          <span className="text-neutral-500 text-base ml-2">
            {data.season.year - 1}-{String(data.season.year).slice(-2)}
          </span>
        )}
      </h1>
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
