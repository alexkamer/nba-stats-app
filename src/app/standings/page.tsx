"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

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
  threePtRecord: string | null;
  tenPtRecord: string | null;
  vsOverRecord: string | null;
  vsUnderRecord: string | null;
  otRecord: string | null;
  vsEastRecord: string | null;
  vsAtlRecord: string | null;
  vsCenRecord: string | null;
  vsSeRecord: string | null;
  vsWestRecord: string | null;
  vsNwRecord: string | null;
  vsPacRecord: string | null;
  vsSwRecord: string | null;
  pointsPerGame: number | null;
  oppPointsPerGame: number | null;
  team: {
    id: number;
    displayName: string;
    abbreviation: string;
    logoUrl?: string | null;
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

interface NbaCupStanding {
  id: number;
  seed: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  pointDifferential: number | null;
  streak: string | null;
  team: {
    id: number;
    displayName: string;
    abbreviation: string;
    logoUrl?: string | null;
  };
}

interface NbaCupResponse {
  season: SeasonInfo | null;
  availableSeasons: SeasonInfo[];
  groups: { groupName: string; standings: NbaCupStanding[] }[];
}

type ViewMode = "league" | "conference" | "division";
type PageMode = "standings" | "expanded" | "vs-division" | "nba-cup";

const PAGE_MODES: { value: PageMode; label: string }[] = [
  { value: "standings", label: "Standings" },
  { value: "expanded", label: "Expanded" },
  { value: "vs-division", label: "Vs. Division" },
  { value: "nba-cup", label: "NBA Cup" },
];

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

interface ExtraColumn {
  label: string;
  divider?: boolean;
  render: (s: Standing) => ReactNode;
}

// Columns beyond W/L/PCT/GB, specific to each page mode — standings has none
// of its own render logic shared with expanded/vs-division, so each mode
// lists its own column set here rather than branching per-cell in the JSX.
const EXTRA_COLUMNS: Record<PageMode, ExtraColumn[]> = {
  standings: [
    { label: "HOME", divider: true, render: (s) => s.homeRecord },
    { label: "AWAY", render: (s) => s.awayRecord },
    { label: "DIV", render: (s) => s.divRecord },
    { label: "CONF", render: (s) => s.confRecord },
    { label: "PPG", divider: true, render: (s) => s.pointsPerGame?.toFixed(1) },
    { label: "OPP PPG", render: (s) => s.oppPointsPerGame?.toFixed(1) },
    { label: "DIFF", render: (s) => formatDiff(s.pointsPerGame, s.oppPointsPerGame) },
    { label: "STRK", divider: true, render: (s) => formatStreak(s.streak) },
    { label: "L10", render: (s) => s.lastTen },
  ],
  expanded: [
    { label: "3 PT Games", divider: true, render: (s) => s.threePtRecord },
    { label: "10 PT Games", render: (s) => s.tenPtRecord },
    { label: "vs. .500 and Above", render: (s) => s.vsOverRecord },
    { label: "vs. Below .500", render: (s) => s.vsUnderRecord },
    { label: "OT", render: (s) => s.otRecord },
  ],
  "vs-division": [
    { label: "EAST", divider: true, render: (s) => s.vsEastRecord },
    { label: "ATL", render: (s) => s.vsAtlRecord },
    { label: "CEN", render: (s) => s.vsCenRecord },
    { label: "SE", render: (s) => s.vsSeRecord },
    { label: "WEST", divider: true, render: (s) => s.vsWestRecord },
    { label: "NW", render: (s) => s.vsNwRecord },
    { label: "PAC", render: (s) => s.vsPacRecord },
    { label: "SW", render: (s) => s.vsSwRecord },
  ],
  "nba-cup": [],
};

// The play-in tournament started in the 2020-21 season (year 2021 in our
// convention) — don't draw play-in lines on seasons before it existed.
const PLAY_IN_START_YEAR = 2021;

// Vertical divider between column groups: Team | W-L-PCT-GB | HOME-AWAY-DIV-CONF | PPG-OPP PPG-DIFF | STRK-L10
const COLUMN_DIVIDER = "border-l border-border pl-3";

async function fetchStandings(year: number | null): Promise<StandingsResponse> {
  const url = year ? `/api/standings?year=${year}` : "/api/standings";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load standings");
  return res.json();
}

async function fetchNbaCupStandings(year: number | null): Promise<NbaCupResponse> {
  const url = year ? `/api/nba-cup-standings?year=${year}` : "/api/nba-cup-standings";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load NBA Cup standings");
  return res.json();
}

function formatCupStreak(streak: string | null): string {
  if (streak === null) return "";
  const n = Number(streak);
  if (n < 0) return `L${-n}`;
  if (n > 0) return `W${n}`;
  return "";
}

export default function StandingsPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("conference");
  const [pageMode, setPageMode] = useState<PageMode>("standings");
  const [selectedCupYear, setSelectedCupYear] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["standings", selectedYear],
    queryFn: () => fetchStandings(selectedYear),
    enabled: pageMode !== "nba-cup",
  });
  const {
    data: cupData,
    isLoading: cupIsLoading,
    error: cupError,
  } = useQuery({
    queryKey: ["nba-cup-standings", selectedCupYear],
    queryFn: () => fetchNbaCupStandings(selectedCupYear),
    enabled: pageMode === "nba-cup",
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

  const pageModeToggle = (
    <div className="flex rounded-md border border-border overflow-hidden text-sm w-fit">
      {PAGE_MODES.map((mode) => (
        <button
          key={mode.value}
          onClick={() => setPageMode(mode.value)}
          className={`px-3 py-2 ${
            pageMode === mode.value
              ? "bg-accent text-accent-foreground font-semibold"
              : "bg-surface text-foreground/82 hover:text-foreground/92"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );

  if (pageMode === "nba-cup") {
    if (cupIsLoading) return <p className="text-foreground/82">Loading NBA Cup standings…</p>;
    if (cupError || !cupData) return <p className="text-red-600 dark:text-red-400">Failed to load NBA Cup standings.</p>;

    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">
            NBA Standings
            {cupData.season && (
              <span className="text-foreground/72 text-base ml-2">{seasonLabel(cupData.season.year)}</span>
            )}
          </h1>
          {pageModeToggle}
          {cupData.availableSeasons.length > 0 && (
            <select
              value={cupData.season?.year ?? ""}
              onChange={(e) => setSelectedCupYear(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {cupData.availableSeasons.map((s) => (
                <option key={s.year} value={s.year}>
                  {seasonLabel(s.year)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-8">
          {cupData.groups.map((group) => (
            <section key={group.groupName}>
              <h2 className="text-lg font-medium text-foreground/92 mb-3">{group.groupName}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-foreground/72 border-b border-border">
                      <th className="py-2 pr-3"></th>
                      <th className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>W</th>
                      <th className="py-2 pr-3 text-right">L</th>
                      <th className="py-2 pr-3 text-right">PCT</th>
                      <th className="py-2 pr-3 text-right">GB</th>
                      <th className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>HOME</th>
                      <th className="py-2 pr-3 text-right">AWAY</th>
                      <th className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>PF</th>
                      <th className="py-2 pr-3 text-right">PA</th>
                      <th className="py-2 pr-3 text-right">DIFF</th>
                      <th className={`py-2 text-right ${COLUMN_DIVIDER}`}>STRK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.standings
                      .slice()
                      .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
                      .map((s) => (
                        <tr key={s.id} className="border-b border-border/60">
                          <td className="py-2 pr-3">
                            <Link
                              href={`/teams/${s.team.id}`}
                              className="flex items-center gap-2 hover:text-foreground/92"
                            >
                              {s.team.logoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.team.logoUrl} alt="" className="h-5 w-5" />
                              )}
                              {s.team.displayName}
                            </Link>
                          </td>
                          <td className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>{s.wins}</td>
                          <td className="py-2 pr-3 text-right">{s.losses}</td>
                          <td className="py-2 pr-3 text-right">{s.winPct?.toFixed(3)}</td>
                          <td className="py-2 pr-3 text-right">{s.gamesBehind}</td>
                          <td className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>{s.homeRecord}</td>
                          <td className="py-2 pr-3 text-right">{s.awayRecord}</td>
                          <td className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>{s.pointsFor}</td>
                          <td className="py-2 pr-3 text-right">{s.pointsAgainst}</td>
                          <td className="py-2 pr-3 text-right">
                            {s.pointDifferential !== null && s.pointDifferential >= 0 ? "+" : ""}
                            {s.pointDifferential}
                          </td>
                          <td className={`py-2 text-right ${COLUMN_DIVIDER}`}>
                            {formatCupStreak(s.streak)}
                          </td>
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

  if (isLoading) return <p className="text-foreground/82">Loading standings…</p>;
  if (error || !data) return <p className="text-red-600 dark:text-red-400">Failed to load standings.</p>;

  const groups =
    viewMode === "league"
      ? leagueGroups
      : viewMode === "conference"
        ? data.conferences.map((c) => ({ groupName: c.conferenceName, standings: c.standings }))
        : divisionGroups;
  const rankField = viewMode === "league" ? "leagueRank" : viewMode === "conference" ? "conferenceRank" : "divisionRank";
  // Play-in lines only make sense per-conference (the tournament is seeded
  // within each conference, not league- or division-wide).
  const showPlayInLines = viewMode === "conference" && (data.season?.year ?? 0) >= PLAY_IN_START_YEAR;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">
          NBA Standings
          {data.season && <span className="text-foreground/72 text-base ml-2">{seasonLabel(data.season.year)}</span>}
        </h1>
        {pageModeToggle}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {(["league", "conference", "division"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 capitalize ${
                  viewMode === mode
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "bg-surface text-foreground/82 hover:text-foreground/92"
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
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
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
            <h2 className="text-lg font-medium text-foreground/92 mb-3">{group.groupName}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-foreground/72 border-b border-border">
                    <th className="py-2 pr-3"></th>
                    <th className="py-2 pr-3"></th>
                    <th className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>W</th>
                    <th className="py-2 pr-3 text-right">L</th>
                    <th className="py-2 pr-3 text-right">PCT</th>
                    <th className="py-2 pr-3 text-right">GB</th>
                    {EXTRA_COLUMNS[pageMode].map((col) => (
                      <th
                        key={col.label}
                        className={`py-2 pr-3 text-right ${col.divider ? COLUMN_DIVIDER : ""}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.standings
                    .slice()
                    .sort((a, b) => (a[rankField] ?? 0) - (b[rankField] ?? 0))
                    .map((s) => {
                      const rank = s[rankField] ?? 0;
                      const borderClass = showPlayInLines
                        ? rank === 6
                          ? "border-b-2 border-dotted border-foreground/40"
                          : rank === 10
                            ? "border-b-2 border-solid border-foreground/60"
                            : "border-b border-border/60"
                        : "border-b border-border/60";
                      const hideRank = showPlayInLines && rank >= 11;
                      return (
                        <tr key={s.id} className={borderClass}>
                          <td className="py-2 pr-3 text-foreground/72">{hideRank ? "" : rank}</td>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/teams/${s.team.id}`}
                              className="flex items-center gap-2 hover:text-foreground/92"
                            >
                              {s.team.logoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.team.logoUrl} alt="" className="h-5 w-5" />
                              )}
                              {s.team.displayName}
                            </Link>
                          </td>
                          <td className={`py-2 pr-3 text-right ${COLUMN_DIVIDER}`}>{s.wins}</td>
                          <td className="py-2 pr-3 text-right">{s.losses}</td>
                          <td className="py-2 pr-3 text-right">{s.winPct?.toFixed(3)}</td>
                          <td className="py-2 pr-3 text-right">{s.gamesBehind}</td>
                          {EXTRA_COLUMNS[pageMode].map((col) => (
                            <td
                              key={col.label}
                              className={`py-2 pr-3 text-right ${col.divider ? COLUMN_DIVIDER : ""}`}
                            >
                              {col.render(s)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
