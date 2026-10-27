"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

interface Standing {
  id: number;
  conferenceRank: number | null;
  divisionRank: number | null;
  leagueRank?: number;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
  divRecord: string | null;
  confRecord: string | null;
  lastTen: string | null;
  pointsPerGame: number | null;
  oppPointsPerGame: number | null;
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

type ViewMode = "league" | "conference" | "division";

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function formatStreak(streak: string | null): string {
  if (streak === null) return "";
  if (streak.startsWith("-")) return `L${streak.slice(1)}`;
  return `W${streak}`;
}

function formatDiff(ppg: number | null, oppPpg: number | null): string {
  if (ppg === null || oppPpg === null) return "";
  const diff = ppg - oppPpg;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}`;
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

  // League view has no stored rank (standings/season-stats.ts only ever
  // computes conference/division rank from ESPN) — derive it client-side
  // by win pct, tie-broken by wins, same approach already used for
  // division rank server-side.
  const leagueGroups = useMemo(() => {
    if (!data) return [];
    const allStandings = data.conferences.flatMap((c) => c.standings);
    const ranked = allStandings
      .slice()
      .sort((a, b) => (b.winPct ?? 0) - (a.winPct ?? 0) || (b.wins ?? 0) - (a.wins ?? 0))
      .map((s, i) => ({ ...s, leagueRank: i + 1 }));
    return [{ groupName: "League", standings: ranked }];
  }, [data]);

  if (isLoading) return <p className="text-neutral-400">Loading standings…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load standings.</p>;

  const groups =
    viewMode === "league"
      ? leagueGroups
      : viewMode === "conference"
        ? data.conferences.map((c) => ({ groupName: c.conferenceName, standings: c.standings }))
        : divisionGroups;
  const rankField = viewMode === "league" ? "leagueRank" : viewMode === "conference" ? "conferenceRank" : "divisionRank";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">
          Standings
          {data.season && <span className="text-neutral-500 text-base ml-2">{seasonLabel(data.season.year)}</span>}
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-neutral-800 overflow-hidden text-sm">
            {(["league", "conference", "division"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 capitalize ${
                  viewMode === mode
                    ? "bg-neutral-800 text-neutral-100 font-semibold"
                    : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
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
      {/* One table per group, stacked vertically — with this many columns,
          side-by-side grids get too cramped to read. */}
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.groupName}>
            <h2 className="text-lg font-medium text-neutral-300 mb-3">{group.groupName}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-neutral-800">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Team</th>
                    <th className="py-2 pr-3 text-right">W</th>
                    <th className="py-2 pr-3 text-right">L</th>
                    <th className="py-2 pr-3 text-right">PCT</th>
                    <th className="py-2 pr-3 text-right">GB</th>
                    <th className="py-2 pr-3 text-right">HOME</th>
                    <th className="py-2 pr-3 text-right">AWAY</th>
                    <th className="py-2 pr-3 text-right">DIV</th>
                    <th className="py-2 pr-3 text-right">CONF</th>
                    <th className="py-2 pr-3 text-right">PPG</th>
                    <th className="py-2 pr-3 text-right">OPP PPG</th>
                    <th className="py-2 pr-3 text-right">DIFF</th>
                    <th className="py-2 pr-3 text-right">STRK</th>
                    <th className="py-2 text-right">L10</th>
                  </tr>
                </thead>
                <tbody>
                  {group.standings
                    .slice()
                    .sort((a, b) => (a[rankField] ?? 0) - (b[rankField] ?? 0))
                    .map((s) => (
                      <tr key={s.id} className="border-b border-neutral-900">
                        <td className="py-2 pr-3 text-neutral-500">{s[rankField]}</td>
                        <td className="py-2 pr-3">
                          <Link href={`/teams/${s.team.id}`} className="hover:text-neutral-100">
                            {s.team.displayName}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right">{s.wins}</td>
                        <td className="py-2 pr-3 text-right">{s.losses}</td>
                        <td className="py-2 pr-3 text-right">{s.winPct?.toFixed(3)}</td>
                        <td className="py-2 pr-3 text-right">{s.gamesBehind}</td>
                        <td className="py-2 pr-3 text-right">{s.homeRecord}</td>
                        <td className="py-2 pr-3 text-right">{s.awayRecord}</td>
                        <td className="py-2 pr-3 text-right">{s.divRecord}</td>
                        <td className="py-2 pr-3 text-right">{s.confRecord}</td>
                        <td className="py-2 pr-3 text-right">{s.pointsPerGame?.toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right">{s.oppPointsPerGame?.toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right">{formatDiff(s.pointsPerGame, s.oppPointsPerGame)}</td>
                        <td className="py-2 pr-3 text-right">{formatStreak(s.streak)}</td>
                        <td className="py-2 text-right">{s.lastTen}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
