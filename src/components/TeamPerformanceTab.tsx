"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { SectionCard } from "@/components/SectionCard";
import {
  AverageLabelPill,
  PerformanceLabelPill,
  TAG_TEXT,
  formatMargin,
  marginColorClass,
  type AverageLabelValue,
  type PerformanceLabelValue,
} from "@/components/performance-display";

interface SplitAverage {
  average: number | null;
  games: number;
}

interface PerformanceSummary {
  games: number;
  seasonAverage: number | null;
  seasonLabel: AverageLabelValue | null;
  lastTen: SplitAverage;
  asFavorite: SplitAverage;
  asUnderdog: SplitAverage;
  home: SplitAverage;
  away: SplitAverage;
}

interface PerformanceGame {
  gameId: number;
  espnId: string;
  date: string;
  opponent: { id: number; displayName: string; abbreviation: string; logoUrl: string | null } | null;
  isHome: boolean;
  isFavorite: boolean | null;
  teamScore: number | null;
  opponentScore: number | null;
  spread: number;
  expectedMargin: number;
  actualMargin: number;
  coverMargin: number;
  label: PerformanceLabelValue;
  tags: string[];
}

interface SeasonTrendEntry {
  year: number;
  averageCoverMargin: number;
  label: AverageLabelValue;
  games: number;
}

interface TeamPerformanceResponse {
  year: number;
  summary: PerformanceSummary;
  games: PerformanceGame[];
  seasonTrend: SeasonTrendEntry[];
}

async function fetchTeamPerformance(teamId: number, year: number | null): Promise<TeamPerformanceResponse> {
  const query = year ? `?year=${year}` : "";
  const res = await fetch(`/api/teams/${teamId}/performance${query}`);
  if (!res.ok) throw new Error("Failed to load team performance");
  return res.json();
}

/** Cover margins beyond this are clamped when drawing the trend bars, so one
 * 40-point blowout can't flatten every other bar. */
const CHART_CLAMP = 30;

function SplitStat({ label, split }: { label: string; split: SplitAverage }) {
  return (
    <div className="rounded-md bg-surface-muted px-3 py-2">
      <p className="text-xs text-foreground/72">{label}</p>
      <p className={`text-lg font-semibold ${marginColorClass(split.average)}`}>{formatMargin(split.average)}</p>
      <p className="text-xs text-foreground/60">{split.games > 0 ? `${split.games} game${split.games === 1 ? "" : "s"}` : "No games"}</p>
    </div>
  );
}

function TrendChart({ games }: { games: PerformanceGame[] }) {
  return (
    <div className="flex h-40 items-stretch gap-px" role="img" aria-label="Cover margin per game, oldest to newest">
      {games.map((g) => {
        const clamped = Math.max(-CHART_CLAMP, Math.min(CHART_CLAMP, g.coverMargin));
        const heightPct = (Math.abs(clamped) / CHART_CLAMP) * 50;
        const positive = g.coverMargin > 0;
        const title = `${new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${g.isHome ? "vs" : "@"} ${
          g.opponent?.abbreviation ?? "?"
        }: ${formatMargin(g.coverMargin)}`;
        return (
          <div key={g.gameId} title={title} className="relative min-w-px flex-1">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <div
              className={`absolute inset-x-0 ${positive ? "bottom-1/2 bg-emerald-500" : "top-1/2 bg-red-500"}`}
              style={{ height: `${heightPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SeasonTrendChart({ trend }: { trend: SeasonTrendEntry[] }) {
  return (
    <div className="flex h-32 items-stretch gap-1" role="img" aria-label="Average cover margin per season, oldest to newest">
      {trend.map((s) => {
        const clamped = Math.max(-CHART_CLAMP, Math.min(CHART_CLAMP, s.averageCoverMargin));
        const heightPct = (Math.abs(clamped) / CHART_CLAMP) * 50;
        const positive = s.averageCoverMargin > 0;
        return (
          <div
            key={s.year}
            title={`${s.year}: ${formatMargin(s.averageCoverMargin)} over ${s.games} game${s.games === 1 ? "" : "s"}`}
            className="relative min-w-px flex-1"
          >
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <div
              className={`absolute inset-x-0 ${positive ? "bottom-1/2 bg-emerald-500" : "top-1/2 bg-red-500"}`}
              style={{ height: `${heightPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SeasonTrendSection({ trend, accentColor }: { trend: SeasonTrendEntry[]; accentColor: string }) {
  if (trend.length === 0) {
    return (
      <SectionCard title="Season-over-season trend" accentColor={accentColor}>
        <p className="text-sm text-foreground/72">No performance data is available for this team in any season yet.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Season-over-season trend" accentColor={accentColor}>
      <div className="space-y-4">
        <SeasonTrendChart trend={trend} />
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-left text-foreground/72">
                <th className="py-2 pl-3 pr-4">Season</th>
                <th className="py-2 pr-4 text-right">Avg vs. line</th>
                <th className="py-2 pr-4 pl-4">Verdict</th>
                <th className="py-2 pr-3 text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {trend
                .slice()
                .reverse()
                .map((s) => (
                  <tr key={s.year} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pl-3 pr-4 text-foreground/92">{s.year}</td>
                    <td className={`py-2 pr-4 text-right font-semibold ${marginColorClass(s.averageCoverMargin)}`}>
                      {formatMargin(s.averageCoverMargin)}
                    </td>
                    <td className="py-2 pr-4 pl-4">
                      <AverageLabelPill label={s.label} />
                    </td>
                    <td className="py-2 pr-3 text-right text-foreground/72">{s.games}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

export function TeamPerformanceTab({
  teamId,
  year,
  accentColor,
}: {
  teamId: number;
  /** Season year selected on the team page, or null to use the current season. */
  year: number | null;
  accentColor: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["teamPerformance", teamId, year],
    queryFn: () => fetchTeamPerformance(teamId, year),
  });

  if (isLoading) return <p className="text-foreground/82">Loading…</p>;
  if (error || !data) return <p className="text-red-600 dark:text-red-400">Failed to load team performance.</p>;

  const { summary, games, seasonTrend } = data;

  if (summary.games === 0) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-foreground/72">
          No performance data is available for this season yet. Games need a recorded point spread to be graded.
        </p>
        <SeasonTrendSection trend={seasonTrend} accentColor={accentColor} />
      </div>
    );
  }

  // Newest first for the list; the chart stays oldest-to-newest.
  const listGames = games.slice().reverse();

  return (
    <div className="space-y-6">
      <SectionCard title="Performance vs. expectation" accentColor={accentColor}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className={`text-4xl font-extrabold tracking-tight ${marginColorClass(summary.seasonAverage)}`}>
              {formatMargin(summary.seasonAverage)}
            </p>
            <div>
              {summary.seasonLabel && <AverageLabelPill label={summary.seasonLabel} />}
              <p className="text-xs text-foreground/72">
                average points vs. the spread over {summary.games} graded game{summary.games === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <SplitStat label="Last 10" split={summary.lastTen} />
            <SplitStat label="As favorite" split={summary.asFavorite} />
            <SplitStat label="As underdog" split={summary.asUnderdog} />
            <SplitStat label="Home" split={summary.home} />
            <SplitStat label="Away" split={summary.away} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cover margin by game" accentColor={accentColor}>
        <TrendChart games={games} />
        <p className="mt-2 text-xs text-foreground/60">
          Green bars beat the spread, red bars fell short. Oldest game on the left.
        </p>
      </SectionCard>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-border text-left text-foreground/72">
              <th className="py-2 pl-3 pr-4">Date</th>
              <th className="py-2 pr-4">Opponent</th>
              <th className="py-2 pr-4 text-right">Line</th>
              <th className="py-2 pr-4">Result</th>
              <th className="py-2 pr-4 text-right">vs. line</th>
              <th className="py-2 pr-4">Performance</th>
              <th className="py-2 pr-3">Why</th>
            </tr>
          </thead>
          <tbody>
            {listGames.map((g) => {
              const won = g.actualMargin > 0;
              return (
                <tr key={g.gameId} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pl-3 pr-4 text-foreground/82">
                    {new Date(g.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </td>
                  <td className="py-2 pr-4">
                    {g.opponent ? (
                      <Link href={`/teams/${g.opponent.id}`} className="flex items-center gap-2 hover:text-foreground">
                        <span className="text-foreground/72">{g.isHome ? "vs" : "@"}</span>
                        {g.opponent.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.opponent.logoUrl} alt="" className="h-5 w-5" />
                        )}
                        <span>{g.opponent.abbreviation}</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right text-foreground/82">{g.spread > 0 ? `+${g.spread}` : g.spread === 0 ? "PK" : g.spread}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/games/${g.espnId}`} className="hover:text-foreground">
                      <span className={`font-semibold ${won ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {won ? "W" : "L"}
                      </span>{" "}
                      <span className="text-foreground/82">
                        {g.teamScore}-{g.opponentScore}
                      </span>
                    </Link>
                  </td>
                  <td className={`py-2 pr-4 text-right font-semibold ${marginColorClass(g.coverMargin)}`}>{formatMargin(g.coverMargin)}</td>
                  <td className="py-2 pr-4">
                    <PerformanceLabelPill label={g.label} />
                  </td>
                  <td className="py-2 pr-3">
                    {g.tags.length === 0 ? (
                      <span className="text-foreground/50">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {g.tags.map((tag) => (
                          <span key={tag} className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground/82">
                            {TAG_TEXT[tag] ?? tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SeasonTrendSection trend={seasonTrend} accentColor={accentColor} />
    </div>
  );
}
