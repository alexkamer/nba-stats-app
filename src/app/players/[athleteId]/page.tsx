"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

interface PlayerDetail {
  player: {
    id: number;
    displayName: string;
    headshotUrl: string | null;
    jersey: string | null;
    heightIn: number | null;
    weightLb: number | null;
    birthDate: string | null;
    college: string | null;
    draftYear: number | null;
    draftRound: number | null;
    draftPick: number | null;
    active: boolean;
    position: { name: string } | null;
    currentTeam: { id: number; displayName: string; abbreviation: string; logoUrl: string | null; color: string | null } | null;
    playerSeasonStats: {
      season: { year: number; type: string };
      team: { abbreviation: string; logoUrl: string | null } | null;
      teams: { id: number; abbreviation: string; logoUrl: string | null }[];
      gamesPlayed: number | null;
      pointsPerGame: number | null;
      reboundsPerGame: number | null;
      assistsPerGame: number | null;
      stealsPerGame: number | null;
      blocksPerGame: number | null;
      turnoversPerGame: number | null;
      fieldGoalPct: number | null;
      threePointPct: number | null;
      freeThrowPct: number | null;
      extraStats: {
        gamesStarted: number | null;
        avgMinutes: number | null;
        avgFieldGoalsMade: number | null;
        avgFieldGoalsAttempted: number | null;
        avgThreePointFieldGoalsMade: number | null;
        avgThreePointFieldGoalsAttempted: number | null;
        avgFreeThrowsMade: number | null;
        avgFreeThrowsAttempted: number | null;
        avgFouls: number | null;
        avgOffensiveRebounds: number | null;
        avgDefensiveRebounds: number | null;
        fieldGoalsMade: number | null;
        fieldGoalsAttempted: number | null;
        threePointFieldGoalsMade: number | null;
        threePointFieldGoalsAttempted: number | null;
        freeThrowsMade: number | null;
        freeThrowsAttempted: number | null;
        offensiveRebounds: number | null;
        defensiveRebounds: number | null;
        rebounds: number | null;
        assists: number | null;
        blocks: number | null;
        steals: number | null;
        fouls: number | null;
        turnovers: number | null;
        points: number | null;
        doubleDouble: number | null;
        tripleDouble: number | null;
        disqualifications: number | null;
        ejections: number | null;
        technicalFouls: number | null;
        flagrantFouls: number | null;
        assistTurnoverRatio: number | null;
        stealTurnoverRatio: number | null;
        scoringEfficiency: number | null;
        shootingEfficiency: number | null;
      };
    }[];
  };
  recentGames: {
    id: number;
    minutes: number | null;
    points: number | null;
    rebounds: number | null;
    assists: number | null;
    game: {
      espnId: string;
      date: string;
      homeTeam: { abbreviation: string };
      awayTeam: { abbreviation: string };
    };
  }[];
  seasonRanks: Record<
    "pointsPerGame" | "reboundsPerGame" | "assistsPerGame" | "fieldGoalPct",
    { rank: number; tied: boolean } | null
  >;
}

async function fetchPlayer(athleteId: string): Promise<PlayerDetail> {
  const res = await fetch(`/api/players/${athleteId}`);
  if (!res.ok) throw new Error("Failed to load player");
  return res.json();
}

function formatHeight(heightIn: number | null): string {
  if (!heightIn) return "—";
  return `${Math.floor(heightIn / 12)}'${heightIn % 12}"`;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatRank(r: { rank: number; tied: boolean } | null): string {
  if (!r || r.rank === 0) return "—";
  return r.tied ? `Tied-${ordinal(r.rank)}` : ordinal(r.rank);
}

function formatAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const notYetBirthday =
    now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (notYetBirthday) age -= 1;
  return age;
}

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

type PlayerTab = "overview" | "stats" | "bio" | "splits" | "gameLog" | "advanced";

const PLAYER_TABS: { value: PlayerTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "stats", label: "Stats" },
  { value: "bio", label: "Bio" },
  { value: "splits", label: "Splits" },
  { value: "gameLog", label: "Game Log" },
  { value: "advanced", label: "Advanced Stats" },
];

export default function PlayerDetailPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
      <PlayerDetailContent />
    </Suspense>
  );
}

function PlayerDetailContent() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const [activeTab, setActiveTab] = useState<PlayerTab>("overview");
  const { data, isLoading, error } = useQuery({
    queryKey: ["player", athleteId],
    queryFn: () => fetchPlayer(athleteId),
  });

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load player.</p>;

  const { player, recentGames, seasonRanks } = data;
  const seasonStat = player.playerSeasonStats[0];
  const accentColor = player.currentTeam?.color ? `#${player.currentTeam.color}` : "#525252";
  const [firstName, ...lastNameParts] = player.displayName.trim().split(/\s+/);
  const lastName = lastNameParts.join(" ");
  const age = formatAge(player.birthDate);

  return (
    <div className="space-y-8">
      <div
        className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-neutral-900 border-b border-neutral-800"
        style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
      >
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1.5fr_0.8fr_1.1fr] gap-6 px-6 py-4">
          <div className="flex items-stretch gap-5">
            <div
              className="relative -my-4 h-[calc(100%+2rem)] w-40 shrink-0 overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${accentColor}99, #111827)` }}
            >
              {player.currentTeam?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={player.currentTeam.logoUrl}
                  alt=""
                  className="absolute left-[4%] top-[34%] h-[115%] w-[95%] -translate-y-1/2 object-contain opacity-60"
                />
              )}
              {player.headshotUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={player.headshotUrl}
                  alt={player.displayName}
                  className="absolute right-0 bottom-0 h-full w-full object-contain"
                  style={{ objectPosition: "bottom right" }}
                />
              )}
            </div>
            <div className="flex flex-col justify-center gap-2 min-w-0">
              <h1 className="leading-tight">
                <span className="block text-base font-light tracking-widest text-neutral-300 uppercase">{firstName}</span>
                <span className="block text-4xl font-bold tracking-wide text-neutral-100 uppercase">{lastName}</span>
              </h1>
              <p className="flex items-center gap-1.5 text-sm text-neutral-400 min-w-0">
                {player.currentTeam ? (
                  <Link href={`/teams/${player.currentTeam.id}`} className="flex items-center gap-1.5 hover:text-neutral-100 min-w-0">
                    {player.currentTeam.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.currentTeam.logoUrl} alt="" className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{player.currentTeam.displayName}</span>
                  </Link>
                ) : (
                  "Free agent"
                )}
                {player.jersey && ` · #${player.jersey}`}
                {player.position && ` · ${player.position.name}`}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 content-start text-sm">
            <dt className="text-neutral-500">HT/WT</dt>
            <dd className="font-semibold text-neutral-100">
              {formatHeight(player.heightIn)}
              {player.weightLb && `, ${player.weightLb} lbs`}
            </dd>
            <dt className="text-neutral-500">Birthdate</dt>
            <dd className="font-semibold text-neutral-100">
              {player.birthDate ? new Date(player.birthDate).toLocaleDateString() : "—"}
              {age != null && ` (${age})`}
            </dd>
            <dt className="text-neutral-500">College</dt>
            <dd className="font-semibold text-neutral-100">{player.college ?? "—"}</dd>
            <dt className="text-neutral-500">Draft Info</dt>
            <dd className="font-semibold text-neutral-100">
              {player.draftYear ? `${player.draftYear}: Rd ${player.draftRound ?? "—"}, Pk ${player.draftPick ?? "—"}` : "—"}
            </dd>
            <dt className="text-neutral-500">Status</dt>
            <dd className="flex items-center gap-1.5 font-semibold text-neutral-100">
              <span className={`h-2 w-2 rounded-full ${player.active ? "bg-emerald-500" : "bg-neutral-500"}`} />
              {player.active ? "Active" : "Inactive"}
            </dd>
          </dl>

          {seasonStat && (
            <div className="rounded-md border border-neutral-800 overflow-hidden self-start">
              <div className="px-3 py-1.5 text-center text-xs font-semibold text-white" style={{ backgroundColor: accentColor }}>
                {seasonLabel(seasonStat.season.year)} Regular Season Stats
              </div>
              <div className="grid grid-cols-4 gap-2 divide-x divide-neutral-800 px-2 py-3">
                <HeroStat label="PTS" value={seasonStat.pointsPerGame} rank={seasonRanks.pointsPerGame} />
                <HeroStat label="REB" value={seasonStat.reboundsPerGame} rank={seasonRanks.reboundsPerGame} />
                <HeroStat label="AST" value={seasonStat.assistsPerGame} rank={seasonRanks.assistsPerGame} />
                <HeroStat label="FG%" value={seasonStat.fieldGoalPct} rank={seasonRanks.fieldGoalPct} />
              </div>
            </div>
          )}
        </div>
        <div className="mx-auto max-w-6xl flex border-t border-neutral-800 px-6 text-sm">
          {PLAYER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 px-3 py-2 text-center whitespace-nowrap ${
                activeTab === tab.value
                  ? "text-neutral-100 font-semibold border-b-2"
                  : "text-neutral-400 hover:text-neutral-200 border-b-2 border-transparent"
              }`}
              style={activeTab === tab.value ? { borderColor: accentColor } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-8">
          {seasonStat && (
            <section>
              <h2 className="text-lg font-medium text-neutral-300 mb-3">{seasonLabel(seasonStat.season.year)} season</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-3">
                <Stat label="GP" value={seasonStat.gamesPlayed ?? "—"} />
                <Stat label="PPG" value={seasonStat.pointsPerGame?.toFixed(1) ?? "—"} />
                <Stat label="RPG" value={seasonStat.reboundsPerGame?.toFixed(1) ?? "—"} />
                <Stat label="APG" value={seasonStat.assistsPerGame?.toFixed(1) ?? "—"} />
                <Stat label="SPG" value={seasonStat.stealsPerGame?.toFixed(1) ?? "—"} />
                <Stat label="BPG" value={seasonStat.blocksPerGame?.toFixed(1) ?? "—"} />
                <Stat label="FG%" value={seasonStat.fieldGoalPct?.toFixed(1) ?? "—"} />
                <Stat label="3P%" value={seasonStat.threePointPct?.toFixed(1) ?? "—"} />
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-medium text-neutral-300 mb-3">Recent games</h2>
            <div className="space-y-1">
              {recentGames.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/games/${entry.game.espnId}`}
                  className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600"
                >
                  <span>
                    {entry.game.awayTeam.abbreviation} @ {entry.game.homeTeam.abbreviation}
                  </span>
                  <span className="text-neutral-400">
                    {entry.points ?? 0} pts · {entry.rebounds ?? 0} reb · {entry.assists ?? 0} ast
                  </span>
                  <span className="text-neutral-500">{new Date(entry.game.date).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "stats" && <StatsTab seasons={player.playerSeasonStats} accentColor={accentColor} />}
      {activeTab === "bio" && <PlaceholderTab label="Bio" />}
      {activeTab === "splits" && <PlaceholderTab label="Splits" />}
      {activeTab === "gameLog" && <PlaceholderTab label="Game Log" />}
      {activeTab === "advanced" && <PlaceholderTab label="Advanced Stats" />}
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return <p className="text-neutral-500">{label} coming soon.</p>;
}

type SeasonStatRow = PlayerDetail["player"]["playerSeasonStats"][number];

interface StatColumn {
  label: string;
  cell: (row: SeasonStatRow) => string;
  career: (seasons: SeasonStatRow[]) => string;
}

function fmt1(value: number | null): string {
  return value != null ? value.toFixed(1) : "—";
}

function fmtN(value: number | null, decimals: number): string {
  return value != null ? value.toFixed(decimals) : "—";
}

function fmtInt(value: number | null): string {
  return value != null ? String(Math.round(value)) : "—";
}

function fmtMadeAttempted(made: number | null, attempted: number | null, decimals: number): string {
  if (made == null || attempted == null) return "—";
  return `${made.toFixed(decimals)}-${attempted.toFixed(decimals)}`;
}

function sum(seasons: SeasonStatRow[], select: (s: SeasonStatRow) => number | null): number {
  return seasons.reduce((acc, s) => acc + (select(s) ?? 0), 0);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function weightedAverage(seasons: SeasonStatRow[], select: (s: SeasonStatRow) => number | null): number | null {
  let weightedSum = 0;
  let totalGames = 0;
  for (const season of seasons) {
    const value = select(season);
    const games = season.gamesPlayed;
    if (value == null || games == null || games <= 0) continue;
    weightedSum += value * games;
    totalGames += games;
  }
  return totalGames > 0 ? weightedSum / totalGames : null;
}

function avgCol(label: string, select: (s: SeasonStatRow) => number | null): StatColumn {
  return { label, cell: (row) => fmt1(select(row)), career: (seasons) => fmt1(weightedAverage(seasons, select)) };
}

function totalCol(label: string, select: (s: SeasonStatRow) => number | null): StatColumn {
  return { label, cell: (row) => fmtInt(select(row)), career: (seasons) => fmtInt(sum(seasons, select)) };
}

function madeAttAvgCol(label: string, madeSelect: (s: SeasonStatRow) => number | null, attSelect: (s: SeasonStatRow) => number | null): StatColumn {
  return {
    label,
    cell: (row) => fmtMadeAttempted(madeSelect(row), attSelect(row), 1),
    career: (seasons) => fmtMadeAttempted(weightedAverage(seasons, madeSelect), weightedAverage(seasons, attSelect), 1),
  };
}

function madeAttTotalCol(label: string, madeSelect: (s: SeasonStatRow) => number | null, attSelect: (s: SeasonStatRow) => number | null): StatColumn {
  return {
    label,
    cell: (row) => fmtMadeAttempted(madeSelect(row), attSelect(row), 0),
    career: (seasons) => fmtMadeAttempted(sum(seasons, madeSelect), sum(seasons, attSelect), 0),
  };
}

function pctFromTotalsCol(
  label: string,
  pctSelect: (s: SeasonStatRow) => number | null,
  madeSelect: (s: SeasonStatRow) => number | null,
  attSelect: (s: SeasonStatRow) => number | null,
): StatColumn {
  return {
    label,
    cell: (row) => fmt1(pctSelect(row)),
    career: (seasons) => {
      const pct = ratio(sum(seasons, madeSelect), sum(seasons, attSelect));
      return fmt1(pct != null ? pct * 100 : null);
    },
  };
}

function ratioCol(
  label: string,
  valueSelect: (s: SeasonStatRow) => number | null,
  numSelect: (s: SeasonStatRow) => number | null,
  denSelect: (s: SeasonStatRow) => number | null,
): StatColumn {
  return {
    label,
    cell: (row) => fmt1(valueSelect(row)),
    career: (seasons) => fmt1(ratio(sum(seasons, numSelect), sum(seasons, denSelect))),
  };
}

function rateCol(label: string, select: (s: SeasonStatRow) => number | null, decimals: number): StatColumn {
  return {
    label,
    cell: (row) => fmtN(select(row), decimals),
    career: (seasons) => fmtN(weightedAverage(seasons, select), decimals),
  };
}

const AVERAGES_COLUMNS: StatColumn[] = [
  totalCol("GP", (r) => r.gamesPlayed),
  totalCol("GS", (r) => r.extraStats.gamesStarted),
  avgCol("MIN", (r) => r.extraStats.avgMinutes),
  madeAttAvgCol(
    "FG",
    (r) => r.extraStats.avgFieldGoalsMade,
    (r) => r.extraStats.avgFieldGoalsAttempted,
  ),
  pctFromTotalsCol(
    "FG%",
    (r) => r.fieldGoalPct,
    (r) => r.extraStats.fieldGoalsMade,
    (r) => r.extraStats.fieldGoalsAttempted,
  ),
  madeAttAvgCol(
    "3PT",
    (r) => r.extraStats.avgThreePointFieldGoalsMade,
    (r) => r.extraStats.avgThreePointFieldGoalsAttempted,
  ),
  pctFromTotalsCol(
    "3P%",
    (r) => r.threePointPct,
    (r) => r.extraStats.threePointFieldGoalsMade,
    (r) => r.extraStats.threePointFieldGoalsAttempted,
  ),
  madeAttAvgCol(
    "FT",
    (r) => r.extraStats.avgFreeThrowsMade,
    (r) => r.extraStats.avgFreeThrowsAttempted,
  ),
  pctFromTotalsCol(
    "FT%",
    (r) => r.freeThrowPct,
    (r) => r.extraStats.freeThrowsMade,
    (r) => r.extraStats.freeThrowsAttempted,
  ),
  avgCol("OR", (r) => r.extraStats.avgOffensiveRebounds),
  avgCol("DR", (r) => r.extraStats.avgDefensiveRebounds),
  avgCol("REB", (r) => r.reboundsPerGame),
  avgCol("AST", (r) => r.assistsPerGame),
  avgCol("BLK", (r) => r.blocksPerGame),
  avgCol("STL", (r) => r.stealsPerGame),
  avgCol("PF", (r) => r.extraStats.avgFouls),
  avgCol("TO", (r) => r.turnoversPerGame),
  avgCol("PTS", (r) => r.pointsPerGame),
];

const TOTALS_COLUMNS: StatColumn[] = [
  madeAttTotalCol(
    "FG",
    (r) => r.extraStats.fieldGoalsMade,
    (r) => r.extraStats.fieldGoalsAttempted,
  ),
  pctFromTotalsCol(
    "FG%",
    (r) => r.fieldGoalPct,
    (r) => r.extraStats.fieldGoalsMade,
    (r) => r.extraStats.fieldGoalsAttempted,
  ),
  madeAttTotalCol(
    "3PT",
    (r) => r.extraStats.threePointFieldGoalsMade,
    (r) => r.extraStats.threePointFieldGoalsAttempted,
  ),
  pctFromTotalsCol(
    "3P%",
    (r) => r.threePointPct,
    (r) => r.extraStats.threePointFieldGoalsMade,
    (r) => r.extraStats.threePointFieldGoalsAttempted,
  ),
  madeAttTotalCol(
    "FT",
    (r) => r.extraStats.freeThrowsMade,
    (r) => r.extraStats.freeThrowsAttempted,
  ),
  pctFromTotalsCol(
    "FT%",
    (r) => r.freeThrowPct,
    (r) => r.extraStats.freeThrowsMade,
    (r) => r.extraStats.freeThrowsAttempted,
  ),
  totalCol("OR", (r) => r.extraStats.offensiveRebounds),
  totalCol("DR", (r) => r.extraStats.defensiveRebounds),
  totalCol("REB", (r) => r.extraStats.rebounds),
  totalCol("AST", (r) => r.extraStats.assists),
  totalCol("BLK", (r) => r.extraStats.blocks),
  totalCol("STL", (r) => r.extraStats.steals),
  totalCol("PF", (r) => r.extraStats.fouls),
  totalCol("TO", (r) => r.extraStats.turnovers),
  totalCol("PTS", (r) => r.extraStats.points),
];

const MISC_COLUMNS: StatColumn[] = [
  totalCol("DD2", (r) => r.extraStats.doubleDouble),
  totalCol("TD3", (r) => r.extraStats.tripleDouble),
  totalCol("DQ", (r) => r.extraStats.disqualifications),
  totalCol("EJECT", (r) => r.extraStats.ejections),
  totalCol("TECH", (r) => r.extraStats.technicalFouls),
  totalCol("FLAG", (r) => r.extraStats.flagrantFouls),
  ratioCol(
    "AST/TO",
    (r) => r.extraStats.assistTurnoverRatio,
    (r) => r.extraStats.assists,
    (r) => r.extraStats.turnovers,
  ),
  ratioCol(
    "STL/TO",
    (r) => r.extraStats.stealTurnoverRatio,
    (r) => r.extraStats.steals,
    (r) => r.extraStats.turnovers,
  ),
  rateCol("SC-EFF", (r) => r.extraStats.scoringEfficiency, 3),
  rateCol("SH-EFF", (r) => r.extraStats.shootingEfficiency, 2),
];

function SeasonStatsTable({
  title,
  seasons,
  columns,
  accentColor,
}: {
  title: string;
  seasons: SeasonStatRow[];
  columns: StatColumn[];
  accentColor: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-bold tracking-wide text-neutral-100 uppercase">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm border-collapse">
          <thead>
            <tr className="text-neutral-200 text-xs uppercase">
              <th className="text-left font-bold px-2 py-2 sticky left-0 bg-neutral-950">Season</th>
              <th className="text-left font-bold px-2 py-2">Team</th>
              {columns.map((col) => (
                <th key={col.label} className="text-right font-bold px-2 py-2 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seasons.map((row, i) => (
              <tr
                key={`${row.season.year}-${row.teams.map((t) => t.abbreviation).join("-") || i}`}
                className="border-t border-neutral-800 hover:bg-neutral-900/60"
              >
                <td className="px-2 py-2 sticky left-0 bg-neutral-950 font-medium text-neutral-100 whitespace-nowrap">
                  {seasonLabel(row.season.year)}
                </td>
                <td className="px-2 py-2 text-neutral-300 whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    {row.teams.length > 0 ? (
                      row.teams.map((team, teamIdx) => (
                        <span key={`${team.abbreviation}-${teamIdx}`} className="flex items-center gap-1.5">
                          {teamIdx > 0 && <span className="text-neutral-500">/</span>}
                          {team.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={team.logoUrl} alt="" className="h-4 w-4" />
                          )}
                          <Link href={`/teams/${team.id}`} className="hover:text-neutral-100 hover:underline">
                            {team.abbreviation}
                          </Link>
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </td>
                {columns.map((col) => (
                  <td key={col.label} className="text-right px-2 py-2 text-neutral-200 whitespace-nowrap tabular-nums">
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 font-semibold text-neutral-100" style={{ borderColor: accentColor }}>
              <td className="px-2 py-2 sticky left-0 bg-neutral-950 whitespace-nowrap">Career</td>
              <td className="px-2 py-2" />
              {columns.map((col) => (
                <td key={col.label} className="text-right px-2 py-2 whitespace-nowrap tabular-nums">
                  {col.career(seasons)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatsTab({ seasons, accentColor }: { seasons: SeasonStatRow[]; accentColor: string }) {
  if (seasons.length === 0) return <p className="text-neutral-500">No season stats available.</p>;

  const orderedSeasons = [...seasons].sort((a, b) => a.season.year - b.season.year);

  return (
    <div className="space-y-10">
      <SeasonStatsTable title="Regular Season Averages" seasons={orderedSeasons} columns={AVERAGES_COLUMNS} accentColor={accentColor} />
      <SeasonStatsTable title="Regular Season Totals" seasons={orderedSeasons} columns={TOTALS_COLUMNS} accentColor={accentColor} />
      <SeasonStatsTable title="Regular Season Misc Totals" seasons={orderedSeasons} columns={MISC_COLUMNS} accentColor={accentColor} />
    </div>
  );
}

function HeroStat({
  label,
  value,
  rank,
}: {
  label: string;
  value: number | null;
  rank: { rank: number; tied: boolean } | null;
}) {
  return (
    <div className="px-1.5 py-2 text-center space-y-1.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-xl font-bold text-neutral-100">{value?.toFixed(1) ?? "—"}</p>
      <p className="text-xs text-neutral-500 whitespace-nowrap">{formatRank(rank)}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-center">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
