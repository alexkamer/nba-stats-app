"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Skeleton, SkeletonRow } from "@/components/Skeleton";
import type { L10Game } from "@/components/ui/shared";
import { DiffA, LastTenA, StandingsGroupA, StandingsHeaderA, StreakA, type StandingsRowA } from "@/components/standings/StandingsA";

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
  lastTenGames?: { gameId: string; date: string; opponentId: number; home: boolean; own: number; opp: number; win: boolean }[];
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

const VIEWS_A = [
  { value: "league", label: "League" },
  { value: "conference", label: "Conference" },
  { value: "division", label: "Division" },
] as { value: ViewMode; label: string }[];

const PAGE_MODES: { value: PageMode; label: string }[] = [
  { value: "standings", label: "Standings" },
  { value: "expanded", label: "Expanded" },
  { value: "vs-division", label: "Vs. Division" },
  { value: "nba-cup", label: "NBA Cup" },
];

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function formatStreak(streak: string | null): ReactNode {
  if (streak === null) return "";
  const isLoss = streak.startsWith("-");
  const Icon = isLoss ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1 ${isLoss ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {isLoss ? `L${streak.slice(1)}` : `W${streak}`}
    </span>
  );
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

// The page shows the same columns with richer cells: streak and last ten as
// colored marks and blocks, and the differential colored by sign.
function extraColumnsA(mode: PageMode, abbrById: Map<number, string>): ExtraColumn[] {
  return EXTRA_COLUMNS[mode].map((col) => {
    if (col.label === "STRK") return { ...col, render: (s: Standing) => <StreakA streak={s.streak} /> };
    if (col.label === "L10") return { ...col, render: (s: Standing) => <LastTenA record={s.lastTen} games={s.lastTenGames?.map((g): L10Game => ({ ...g, opponentAbbr: abbrById.get(g.opponentId) ?? "?" }))} /> };
    if (col.label === "DIFF") return { ...col, render: (s: Standing) => <DiffA ppg={s.pointsPerGame} opp={s.oppPointsPerGame} /> };
    return col;
  });
}

// The play-in tournament started in the 2020-21 season (year 2021 in our
// convention) — don't draw play-in lines on seasons before it existed.
const PLAY_IN_START_YEAR = 2021;

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

  if (pageMode === "nba-cup") {
    if (cupIsLoading)
      return (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      );
    if (cupError || !cupData)
      return (
        <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" /> Failed to load NBA Cup standings.
        </p>
      );

    const cupColumns = [
      { label: "HOME", divider: true },
      { label: "AWAY" },
      { label: "PF", divider: true },
      { label: "PA" },
      { label: "DIFF" },
      { label: "STRK", divider: true },
    ];
    return (
      <div className="space-y-8">
        <StandingsHeaderA
          seasonLabel={cupData.season ? seasonLabel(cupData.season.year) : null}
          modes={PAGE_MODES}
          mode={pageMode}
          onMode={setPageMode}
          views={null}
          view={viewMode}
          onView={setViewMode}
          seasons={cupData.availableSeasons.map((x) => ({ value: x.year, label: seasonLabel(x.year) }))}
          season={cupData.season?.year ?? null}
          onSeason={setSelectedCupYear}
        />
        <div className="space-y-6">
          {cupData.groups.map((group) => (
            <StandingsGroupA
              key={group.groupName}
              title={group.groupName}
              columns={cupColumns}
              rows={group.standings
                .slice()
                .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
                .map<StandingsRowA>((x) => ({
                  id: x.id,
                  rank: x.seed ?? "",
                  team: x.team,
                  lead: [x.wins, x.losses, x.winPct?.toFixed(3), x.gamesBehind],
                  cells: [
                    x.homeRecord,
                    x.awayRecord,
                    x.pointsFor,
                    x.pointsAgainst,
                    x.pointDifferential === null ? "" : <span key="d" className={`font-semibold ${x.pointDifferential > 0 ? "text-win" : x.pointDifferential < 0 ? "text-loss" : ""}`}>{`${x.pointDifferential >= 0 ? "+" : ""}${x.pointDifferential}`}</span>,
                    <StreakA key="s" streak={x.streak === "0" ? null : x.streak} />,
                  ],
                  rule: null,
                  advances: x.seed === 1,
                }))}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isLoading)
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-2">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ))}
      </div>
    );
  if (error || !data)
    return (
      <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="h-4 w-4" /> Failed to load standings.
      </p>
    );

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

  const abbrById = new Map(data.conferences.flatMap((c) => c.standings).map((s) => [s.team.id, s.team.abbreviation] as const));
  const columns = extraColumnsA(pageMode, abbrById);
  return (
    <div className="space-y-8">
      <StandingsHeaderA
        seasonLabel={data.season ? seasonLabel(data.season.year) : null}
        modes={PAGE_MODES}
        mode={pageMode}
        onMode={setPageMode}
        views={VIEWS_A}
        view={viewMode}
        onView={setViewMode}
        seasons={data.availableSeasons.map((x) => ({ value: x.year, label: seasonLabel(x.year) }))}
        season={data.season?.year ?? null}
        onSeason={setSelectedYear}
      />
      <div className="space-y-6">
        {groups.map((group) => (
          <StandingsGroupA
            key={group.groupName}
            title={group.groupName}
            columns={columns.map((c) => ({ label: c.label, divider: c.divider }))}
            rows={group.standings
              .slice()
              .sort((a, b) => (a[rankField] ?? 0) - (b[rankField] ?? 0))
              .map<StandingsRowA>((x) => {
                const rank = x[rankField] ?? 0;
                return {
                  id: x.id,
                  rank: showPlayInLines && rank >= 11 ? "" : rank,
                  team: x.team,
                  lead: [x.wins, x.losses, x.winPct?.toFixed(3), x.gamesBehind],
                  cells: columns.map((c) => c.render(x)),
                  rule: showPlayInLines ? (rank === 6 ? "after-six" : rank === 10 ? "after-ten" : null) : null,
                  advances: showPlayInLines && rank > 0 && rank <= 6,
                };
              })}
          />
        ))}
      </div>
      {showPlayInLines && (
        <p className="text-sm text-foreground/60">
          The top six teams in each conference qualify directly (dotted line). Seventh through tenth play in for the last two spots (solid line).
        </p>
      )}
    </div>
  );
}
