"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTheme } from "next-themes";
import { getTeamAccent } from "@/lib/team-accent";
import { computeEdgeRatio } from "@lib/projections/confidence";
import { SectionCard } from "@/components/SectionCard";
import { SkeletonDetailPage } from "@/components/Skeleton";

interface TeamSummary {
  id: number;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
  color: string | null;
}

type PropResult = "OVER" | "UNDER" | "PUSH";
type ResearchFilter = "all" | "home" | "away" | "opponent";

interface HistoryGame {
  gameEspnId: string;
  date: string;
  isHome: boolean;
  opponent: TeamSummary;
  value: number;
  result: PropResult | null;
}

interface HitRateSummary {
  games: number;
  over: number;
  under: number;
  push: number;
  sampleSizeNote: string | null;
}

interface GridCell {
  statType: string;
  value: number;
  result: PropResult | null;
}

interface GridRow {
  gameEspnId: string;
  date: string;
  isHome: boolean;
  opponent: TeamSummary;
  minutes: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  cells: GridCell[];
}

interface ResearchData {
  player: {
    id: number;
    espnId: string;
    displayName: string;
    headshotUrl: string | null;
  };
  game: { espnId: string; date: string; isHomeToday: boolean };
  // True when scoped to one specific already-played game (via `?game=`)
  // rather than today's live prop — see fetchResearch's `game` param.
  historical: boolean;
  team: TeamSummary;
  opponent: TeamSummary;
  statType: string;
  statTypes: string[];
  line: number | null;
  odds: { over: number | null; under: number | null };
  projection: {
    projectedValue: number;
    stdev: number | null;
    bettable: boolean;
  } | null;
  filter: ResearchFilter;
  seasons: { id: number; year: number }[];
  selectedSeasonId: number | null;
  history: HistoryGame[];
  hitRates: {
    l5: HitRateSummary;
    l10: HitRateSummary;
    l20: HitRateSummary;
    season: HitRateSummary;
  };
  grid: GridRow[];
}

type ResearchResponse = { notFound: true } | ResearchData;

// Same display labels as the betting page (src/app/betting/page.tsx) — kept
// local since this page has its own small set of stat tabs to label.
const STAT_LABELS: Record<string, string> = {
  POINTS: "Points",
  REBOUNDS: "Rebounds",
  ASSISTS: "Assists",
  THREE_POINTERS_MADE: "3-Pointers Made",
  STEALS: "Steals",
  BLOCKS: "Blocks",
  POINTS_ASSISTS: "Points + Assists",
  POINTS_REBOUNDS: "Points + Rebounds",
  REBOUNDS_ASSISTS: "Rebounds + Assists",
  POINTS_REBOUNDS_ASSISTS: "Points + Rebounds + Assists",
  DOUBLE_DOUBLE: "Double-Double",
  TRIPLE_DOUBLE: "Triple-Double",
};

// Abbreviated labels for the grid's column headers — same shorthand the
// betting page uses (src/app/betting/page.tsx) — so ~10 stat columns fit
// without each one wrapping or forcing excess column width.
const STAT_LABELS_SHORT: Record<string, string> = {
  POINTS: "PTS",
  REBOUNDS: "REB",
  ASSISTS: "AST",
  THREE_POINTERS_MADE: "3PM",
  STEALS: "STL",
  BLOCKS: "BLK",
  POINTS_ASSISTS: "PTS+AST",
  POINTS_REBOUNDS: "PTS+REB",
  REBOUNDS_ASSISTS: "REB+AST",
  POINTS_REBOUNDS_ASSISTS: "PRA",
  DOUBLE_DOUBLE: "DBL-DBL",
  TRIPLE_DOUBLE: "TRP-DBL",
};

async function fetchResearch(
  playerId: string,
  stat: string | null,
  filter: ResearchFilter,
  seasonId: number | null,
  game: string | null,
): Promise<ResearchResponse> {
  const qs = new URLSearchParams();
  if (stat) qs.set("stat", stat);
  qs.set("filter", filter);
  if (seasonId !== null) qs.set("seasonId", String(seasonId));
  if (game) qs.set("game", game);
  const res = await fetch(`/api/betting/research/${playerId}?${qs.toString()}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error("Failed to load player prop research");
  return res.json();
}

// ESPN labels a season by the year it concludes in — "2026" means the
// 2025-26 season — so render it back out as the familiar "2025-26".
function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(2)}`;
}

function formatLine(line: number): string {
  return Number.isInteger(line) ? `${line}` : line.toFixed(1);
}

/** American odds, e.g. +150 / -110 — same house convention as the game and
 * betting pages' own `formatSigned` (each keeps a local copy). */
function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  accentColor,
  accentForeground,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accentColor: string;
  accentForeground: string;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-md border border-border text-xs overflow-hidden">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="px-2.5 py-1.5 font-medium transition-colors"
          style={
            value === option.value
              ? { backgroundColor: accentColor, color: accentForeground }
              : { color: "var(--color-foreground)", opacity: 0.72 }
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Row of pill tabs, each sized to its own label and free to wrap onto
 * multiple lines — unlike SegmentedToggle's single bordered pill, this
 * fits an unbounded number of long labels (the combo stat types) without
 * forcing the page wider than its viewport. */
function TabList<T extends string>({
  value,
  options,
  onChange,
  accentColor,
  accentForeground,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accentColor: string;
  accentForeground: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          style={
            value === option.value
              ? {
                  backgroundColor: accentColor,
                  color: accentForeground,
                  borderColor: accentColor,
                }
              : {
                  color: "var(--color-foreground)",
                  opacity: 0.72,
                  borderColor: "var(--border)",
                }
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function resultColor(result: PropResult | null): string {
  if (result === "OVER") return "var(--color-emerald-500, #10b981)";
  if (result === "UNDER") return "var(--color-red-500, #ef4444)";
  return "var(--border)";
}

const CHART_WIDTH = 480;
const CHART_HEIGHT = 180;
const CHART_GAMES = 20;

function dateTick(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// %m/%d/%y, e.g. "04/13/26" — the grid's own date format, distinct from
// dateTick's "Apr 13" used by the chart's axis ticks and tooltip.
function formatGridDate(date: string): string {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

// Scoreboard page (src/app/page.tsx) reads its date from `?date=YYYYMMDD`.
function toScoreboardDateParam(date: string): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Bar per historical game (most recent `CHART_GAMES`, oldest to newest left
 * to right), colored over/under/push against today's line, with the market
 * line and (when available) our own projection drawn as reference lines —
 * follows the hand-rolled SVG convention already used on the game detail
 * page (GameFlowChart/ProbabilityChart) rather than a charting library. */
function HistoryChart({
  history,
  line,
  projection,
  accentColor,
}: {
  history: HistoryGame[];
  line: number | null;
  projection: number | null;
  accentColor: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const games = history.slice(0, CHART_GAMES).slice().reverse();

  if (games.length === 0) {
    return (
      <p className="text-sm text-foreground/72 py-10 text-center">
        No games to chart for this filter — try a different split.
      </p>
    );
  }

  const maxValue =
    Math.max(1, line ?? 0, projection ?? 0, ...games.map((g) => g.value)) *
    1.08;
  const barWidth = CHART_WIDTH / games.length;
  const valueToY = (value: number) =>
    CHART_HEIGHT - (value / maxValue) * CHART_HEIGHT;
  const gridLines = [0.25, 0.5, 0.75];
  const hovered = hoverIndex !== null ? games[hoverIndex] : null;
  const tickIndices =
    games.length <= 1
      ? [0]
      : [0, Math.floor((games.length - 1) / 2), games.length - 1];

  return (
    <div className="px-1 pt-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-44 w-full overflow-visible"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {gridLines.map((fraction) => (
            <line
              key={fraction}
              x1="0"
              y1={CHART_HEIGHT * (1 - fraction)}
              x2={CHART_WIDTH}
              y2={CHART_HEIGHT * (1 - fraction)}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {games.map((game, i) => {
            const barHeight = CHART_HEIGHT - valueToY(game.value);
            const x = i * barWidth + barWidth * 0.18;
            const width = barWidth * 0.64;
            return (
              <g key={game.gameEspnId} onMouseEnter={() => setHoverIndex(i)}>
                <rect
                  x={i * barWidth}
                  y={0}
                  width={barWidth}
                  height={CHART_HEIGHT}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={valueToY(game.value)}
                  width={width}
                  height={Math.max(barHeight, 1.5)}
                  rx={1.5}
                  fill={resultColor(game.result)}
                  opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.55}
                />
              </g>
            );
          })}
          {line !== null && (
            <line
              x1="0"
              y1={valueToY(line)}
              x2={CHART_WIDTH}
              y2={valueToY(line)}
              stroke="var(--foreground)"
              strokeDasharray="4,3"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {projection !== null && (
            <line
              x1="0"
              y1={valueToY(projection)}
              x2={CHART_WIDTH}
              y2={valueToY(projection)}
              stroke={accentColor}
              strokeDasharray="1,3"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm whitespace-nowrap"
            style={{
              left: `${((hoverIndex! + 0.5) / games.length) * 100}%`,
              top: `${Math.max(0, (valueToY(hovered.value) / CHART_HEIGHT) * 100 - 4)}%`,
            }}
          >
            <div className="font-semibold text-foreground">
              {hovered.value} {hovered.isHome ? "vs" : "@"}{" "}
              {hovered.opponent.abbreviation}
            </div>
            <div className="text-foreground/72">
              {new Date(hovered.date).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>
      <div className="relative h-4 text-[10px] text-foreground/60">
        {tickIndices.map((i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2"
            style={{ left: `${((i + 0.5) / games.length) * 100}%` }}
          >
            {dateTick(games[i].date)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-foreground/72 border-t border-border pt-3">
        {line !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-3 border-t-2 border-dashed border-foreground" />{" "}
            Line ({formatLine(line)})
          </span>
        )}
        {projection !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0 w-3 border-t-2 border-dotted"
              style={{ borderColor: accentColor }}
            />{" "}
            Our projection ({formatLine(projection)})
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: resultColor("OVER") }}
          />{" "}
          Over
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: resultColor("UNDER") }}
          />{" "}
          Under
        </span>
      </div>
    </div>
  );
}

/** The page's primary history view: one row per recent game, one column
 * per the player's live tracked stat types, each cell tinted over/under/
 * push against today's line for that column — lets a user see a player's
 * whole prop board at once instead of switching stats to see each one
 * (see player-prop-research-page spec, "Multi-stat hit-rate grid"). */
function HitRateGrid({
  rows,
  statTypes,
  selectedStat,
  onSelectStat,
  accentColor,
}: {
  rows: GridRow[];
  statTypes: string[];
  selectedStat: string;
  onSelectStat: (stat: string) => void;
  accentColor: string;
}) {
  const games = rows.slice(0, CHART_GAMES);

  if (games.length === 0) {
    return (
      <p className="text-sm text-foreground/72 py-10 text-center">
        No games to show for this filter — try a different split.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-foreground/72">
            <th className="pb-2 pr-3 font-normal">Game</th>
            <th className="pb-2 pr-3 text-right font-normal">MIN</th>
            <th className="pb-2 pr-3 text-right font-normal">FG</th>
            {statTypes.map((stat) => (
              <th key={stat} className="pb-2 text-right font-normal">
                <button
                  type="button"
                  onClick={() => onSelectStat(stat)}
                  title={STAT_LABELS[stat] ?? stat}
                  className="rounded px-1.5 py-0.5 font-medium transition-colors"
                  style={
                    stat === selectedStat ? { color: accentColor } : undefined
                  }
                >
                  {STAT_LABELS_SHORT[stat] ?? stat}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map((row) => (
            <tr key={row.gameEspnId} className="border-t border-border/60">
              <td className="py-1.5 pr-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 text-foreground/72">
                  <Link
                    href={`/scoreboard?date=${toScoreboardDateParam(row.date)}`}
                    className="hover:underline hover:text-foreground"
                  >
                    {formatGridDate(row.date)}
                  </Link>
                  {row.isHome ? "vs" : "@"}
                  <Link
                    href={`/games/${row.gameEspnId}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    {row.opponent.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.opponent.logoUrl}
                        alt=""
                        className="h-4 w-4 object-contain"
                      />
                    )}
                    <span className="font-semibold tracking-wide text-foreground">
                      {row.opponent.abbreviation}
                    </span>
                  </Link>
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right text-foreground/82">
                {row.minutes ?? "—"}
              </td>
              <td className="py-1.5 pr-3 text-right text-foreground/82 whitespace-nowrap">
                {row.fgMade ?? "—"}-{row.fgAtt ?? "—"}
              </td>
              {row.cells.map((cell) => (
                <td
                  key={cell.statType}
                  className="py-1.5 text-right"
                  style={
                    cell.statType === selectedStat
                      ? { backgroundColor: `${accentColor}14` }
                      : undefined
                  }
                >
                  <span
                    className="inline-block min-w-[1.75rem] rounded px-1.5 py-0.5 font-medium"
                    style={
                      cell.result
                        ? {
                            backgroundColor: `${resultColor(cell.result)}26`,
                            color: resultColor(cell.result),
                          }
                        : undefined
                    }
                  >
                    {cell.value}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HitRateChip({
  label,
  summary,
  accentColor,
}: {
  label: string;
  summary: HitRateSummary;
  accentColor: string;
}) {
  const rate =
    summary.games > 0 ? Math.round((summary.over / summary.games) * 100) : null;
  const barColor =
    rate === null
      ? "var(--border)"
      : rate >= 55
        ? "var(--color-emerald-500, #10b981)"
        : rate <= 45
          ? "var(--color-red-500, #ef4444)"
          : accentColor;
  return (
    <div className="flex-1 min-w-[90px] rounded-md border border-border bg-surface px-3 py-2.5 text-center">
      <div className="text-xs text-foreground/72 mb-1">{label}</div>
      <div className="text-xl font-bold text-foreground leading-tight">
        {rate !== null ? `${rate}%` : "—"}
      </div>
      <div className="h-1 rounded-full bg-border mt-1.5 mb-1.5 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${rate ?? 0}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="text-xs text-foreground/72">
        {summary.over}-{summary.under}
        {summary.push > 0 ? `-${summary.push}` : ""}
      </div>
      {summary.sampleSizeNote && (
        <div className="text-[10px] text-foreground/60 mt-0.5">
          {summary.sampleSizeNote}
        </div>
      )}
    </div>
  );
}

// useSearchParams requires a Suspense boundary so this route can still be
// prerendered up to it (see Next's "blocking-prerender-client-hook" guidance).
export default function PlayerPropResearchPage() {
  return (
    <Suspense fallback={<SkeletonDetailPage />}>
      <PlayerPropResearchContent />
    </Suspense>
  );
}

function PlayerPropResearchContent() {
  const { playerId } = useParams<{ playerId: string }>();
  const searchParams = useSearchParams();
  const initialStat = searchParams.get("stat");
  // When set (by a link from a past pick — e.g. the accuracy verification
  // tables at /betting/accuracy/[bucket]), scopes the whole page to that
  // one already-played game instead of today's live prop: the line/
  // projection shown is the one frozen for that game, and the history
  // below only goes back from it, not through today.
  const historicalGame = searchParams.get("game");
  const { resolvedTheme } = useTheme();

  const [stat, setStat] = useState<string | null>(initialStat);
  const [filter, setFilter] = useState<ResearchFilter>("all");
  // null means "let the API pick its default (the current season)" — once
  // the user actually picks a season from the dropdown, this is set and
  // sent explicitly so the choice survives the stat/filter it's combined with.
  const [seasonId, setSeasonId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "betting",
      "research",
      playerId,
      stat,
      filter,
      seasonId,
      historicalGame,
    ],
    queryFn: () =>
      fetchResearch(playerId, stat, filter, seasonId, historicalGame),
  });

  if (isLoading) return <SkeletonDetailPage />;
  if (error)
    return (
      <p className="text-red-600 dark:text-red-400">
        Failed to load player prop research.
      </p>
    );
  if (!data) return null;

  if ("notFound" in data) {
    return (
      <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center space-y-1.5">
        <h1 className="text-lg font-semibold">No research available</h1>
        <p className="text-foreground/72 text-sm">
          {historicalGame
            ? "No prop was tracked for this player in that game."
            : "This player has no live prop on today's slate."}
        </p>
        <Link
          href="/betting"
          className="inline-block text-sm text-accent hover:underline pt-1"
        >
          Back to Bettor&apos;s Heaven
        </Link>
      </div>
    );
  }

  const { accent: accentColor, accentForeground } = getTeamAccent(
    data.team.color,
    resolvedTheme === "dark" ? "dark" : "light",
  );
  // Fixed order (not reordered to put the selected stat first) so the tabs
  // don't shuffle position every time the user picks a different one.
  const statOptions = data.statTypes.map((s) => ({
    value: s,
    label: STAT_LABELS[s] ?? s,
  }));
  const gridStatTypes =
    data.grid[0]?.cells.map((cell) => cell.statType) ??
    statOptions.map((s) => s.value);
  const edgeRatio = data.projection
    ? computeEdgeRatio(
        data.projection.projectedValue,
        data.line,
        data.projection.stdev,
      )
    : null;
  const [firstName, ...lastNameParts] = data.player.displayName
    .trim()
    .split(/\s+/);
  const lastName = lastNameParts.join(" ");

  return (
    <div className="space-y-6">
      {data.historical && (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-foreground/72">
          Viewing this pick as it was made for{" "}
          <span className="font-medium text-foreground">
            {new Date(data.game.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>{" "}
          — the line, projection, and history below are all scoped to that game,
          not today.
        </p>
      )}
      <div
        className="sticky top-0 z-10 -mx-6 bg-surface border-b border-border"
        style={{ borderTopColor: accentColor, borderTopWidth: 3 }}
      >
        <div className="flex flex-wrap items-center gap-3 px-6 py-2.5">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-muted">
            {data.player.headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.player.headshotUrl}
                alt={data.player.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              data.team.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.team.logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              )
            )}
          </div>

          <div className="flex flex-1 flex-col min-w-0 leading-tight">
            <Link
              href={`/players/${data.player.espnId}`}
              className="truncate font-semibold text-foreground hover:text-accent"
            >
              {firstName} {lastName}
            </Link>
            <span className="truncate text-xs text-foreground/72">
              {data.team.abbreviation} {data.game.isHomeToday ? "vs" : "@"}{" "}
              {data.opponent.abbreviation} ·{" "}
              {new Date(data.game.date).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm basis-full sm:basis-auto sm:shrink-0">
            <span className="text-foreground/72">
              {STAT_LABELS[data.statType] ?? data.statType}{" "}
              <span className="font-semibold text-foreground">
                {data.line !== null ? formatLine(data.line) : "—"}
              </span>
            </span>
            <span className="hidden sm:inline text-foreground/72">
              Odds{" "}
              <span className="font-medium text-foreground">
                {formatOdds(data.odds.over)} / {formatOdds(data.odds.under)}
              </span>
            </span>
            <span className="hidden sm:inline text-foreground/72">
              Our #{" "}
              <span className="font-medium text-foreground">
                {data.projection
                  ? formatLine(data.projection.projectedValue)
                  : "—"}
              </span>
              {data.projection?.bettable && (
                <span style={{ color: accentColor }}> ●</span>
              )}
            </span>
            <span className="text-foreground/72">
              Confidence{" "}
              <span className="font-medium" style={{ color: accentColor }}>
                {edgeRatio !== null ? `${edgeRatio.toFixed(1)}σ` : "—"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {statOptions.length > 1 && (
          <TabList
            value={data.statType}
            onChange={setStat}
            options={statOptions}
            accentColor={accentColor}
            accentForeground={accentForeground}
          />
        )}

        <SectionCard title="Game log" accentColor={accentColor}>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <SegmentedToggle
              value={filter}
              onChange={setFilter}
              accentColor={accentColor}
              accentForeground={accentForeground}
              options={[
                { value: "all", label: "All" },
                { value: "home", label: "Home" },
                { value: "away", label: "Away" },
                {
                  value: "opponent",
                  label: `vs ${data.opponent.abbreviation}`,
                },
              ]}
            />
            {data.seasons.length > 1 && (
              <select
                value={data.selectedSeasonId ?? ""}
                onChange={(e) => setSeasonId(Number(e.target.value))}
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground"
              >
                {data.seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {seasonLabel(season.year)} season
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            <HitRateChip
              label="L5"
              summary={data.hitRates.l5}
              accentColor={accentColor}
            />
            <HitRateChip
              label="L10"
              summary={data.hitRates.l10}
              accentColor={accentColor}
            />
            <HitRateChip
              label="L20"
              summary={data.hitRates.l20}
              accentColor={accentColor}
            />
            <HitRateChip
              label="Season"
              summary={data.hitRates.season}
              accentColor={accentColor}
            />
          </div>

          <details className="mb-5" open>
            <summary className="cursor-pointer text-sm font-medium text-foreground/72 hover:text-foreground">
              Trend chart — {STAT_LABELS[data.statType] ?? data.statType}
            </summary>
            <HistoryChart
              history={data.history}
              line={data.line}
              projection={data.projection?.projectedValue ?? null}
              accentColor={accentColor}
            />
          </details>

          <HitRateGrid
            rows={data.grid}
            statTypes={gridStatTypes}
            selectedStat={data.statType}
            onSelectStat={setStat}
            accentColor={accentColor}
          />
        </SectionCard>
      </div>
    </div>
  );
}
