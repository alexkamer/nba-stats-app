"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertCircle, Check, X } from "lucide-react";
import { Skeleton, SkeletonRow } from "@/components/Skeleton";

// Drill-down behind each of the five /betting accuracy-strip tiles
// (src/components/StatBlock.tsx's `href`, wired up from src/app/betting/
// page.tsx's AccuracyStrip) — lists the individual graded picks that sum to
// the headline hit rate, so the number can be checked pick-by-pick rather
// than taken on faith. Served by src/app/api/betting/accuracy/[bucket]/
// route.ts, which mirrors the same filters as the headline accuracy route
// (src/app/api/betting/accuracy/route.ts) row-by-row instead of as a single
// aggregate.

const METHODOLOGY: Record<string, string> = {
  model:
    "Every graded straight-up game pick and every graded player prop, pooled together — our model's full season track record.",
  "game-winners":
    "Our model's straight-up game winner picks only, no player props mixed in — the same scope as ESPN's predictor below, for a like-for-like comparison.",
  "spread-all":
    'Every graded against-the-spread pick, confident or not, for every game with a captured market spread — closer to "every game" than the recommended-only bucket below.',
  spread:
    "The subset of against-the-spread picks above where our projected margin cleared the market's line by enough relative to recent variance to be worth calling out — the actual bet the live page recommends, not just the outright winner.",
  espn: "ESPN's own pre-game win-probability predictor, graded the same way as our picks for a like-for-like baseline.",
  "espn-spread":
    "ESPN's predictor doesn't give a projected margin, only a win probability — so the side it favors to win stands in for a spread pick, graded against the same market line our own spread picks use.",
  recommended:
    "Player props where our projection cleared the line by enough relative to the player's own recent variance to be worth calling out (≥0.75σ edge).",
  "high-confidence":
    "A stricter subset of recommended props — only picks with at least a full standard deviation of edge.",
  "best-bets":
    "Each day's single highest-edge recommended prop per player, capped at 8 per day — the same selection the live Best Bets strip makes.",
};

interface VerificationPick {
  id: string;
  date: string;
  type: "game" | "prop";
  gameEspnId: string;
  playerId: number | null;
  playerName: string | null;
  statType: string | null;
  label: string;
  pickDescription: string;
  line: string | null;
  projected: string;
  actual: string;
  confidence: string | null;
  odds: string | null;
  correct: boolean;
}

interface VerificationData {
  bucket: string;
  title: string;
  summary: { graded: number; correct: number; hitRate: number | null };
  picks: VerificationPick[];
}

async function fetchVerification(bucket: string): Promise<VerificationData> {
  const res = await fetch(`/api/betting/accuracy/${bucket}`);
  if (!res.ok) throw new Error("Failed to load accuracy verification data");
  return res.json();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Parses a YYYY-MM-DD day key as local midnight rather than UTC midnight
 * — same fix as the king-of-the-court day page uses — so a negative UTC
 * offset can't display the day before the one that was actually clicked. */
function formatDayKey(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDayKeyShort(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Profit/loss on one pick at a flat unit stake, standard American-odds
 * payout — win pays `odds/100` units per unit staked at positive odds, or
 * `100/|odds|` at negative odds; a loss simply forfeits the stake. `null`
 * when there's no captured odds to settle against (so the caller can show
 * "—" rather than a fabricated number). */
function settlePnl(
  oddsLabel: string | null,
  correct: boolean,
  unitSize: number,
): number | null {
  if (!oddsLabel || oddsLabel === "—") return null;
  const odds = Number(oddsLabel);
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (!correct) return -unitSize;
  return odds > 0 ? unitSize * (odds / 100) : unitSize * (100 / Math.abs(odds));
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

type ChartMode = "bar" | "line";

interface DayPnl {
  day: string;
  pnl: number;
  count: number;
}

/** Local (not UTC) YYYY-MM-DD grouping key for a pick's game date — slicing
 * the ISO string instead would bucket by UTC date, which disagrees with
 * `formatDate`'s own local-timezone rendering for any evening game (its
 * UTC timestamp already rolls into the next UTC day for US timezones), so
 * clicking a bar could silently filter the table to the wrong day. Same
 * local-getters convention as the accuracy route's own `dayKey`. */
function toDayKey(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** One entry per day that has at least one settled (odds-captured) pick,
 * oldest to newest — unsettled picks (no captured odds) are excluded here
 * the same way `settlePnl` excludes them from the Net P/L tile. */
function buildDailyPnl(picks: VerificationPick[], unitSize: number): DayPnl[] {
  const byDay = new Map<string, { pnl: number; count: number }>();
  for (const p of picks) {
    const pnl = settlePnl(p.odds, p.correct, unitSize);
    if (pnl === null) continue;
    const key = toDayKey(p.date);
    const entry = byDay.get(key);
    if (entry) {
      entry.pnl += pnl;
      entry.count += 1;
    } else {
      byDay.set(key, { pnl, count: 1 });
    }
  }
  return [...byDay.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

const PNL_CHART_WIDTH = 480;
const PNL_CHART_HEIGHT = 150;
// Upper bound on date ticks — evenTickIndices already shows every day
// instead of thinning when there are this many or fewer, so a short
// bucket's whole date range shows up rather than just three points.
const PNL_X_TICKS = 10;

/** Compact axis label — "+$1.2k" rather than the tooltip's full
 * "+$1,234.00"; an axis tick only needs to orient the reader, not settle a
 * bet. */
function formatAxisMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const body =
    abs >= 1000
      ? `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
      : abs.toFixed(0);
  return `${sign}$${body}`;
}

/** `target` indices spread as evenly as possible across `[0, length)` —
 * every index when there are fewer days than `target` ticks, otherwise a
 * deduped, sorted even spread (always including both ends). */
function evenTickIndices(length: number, target: number): number[] {
  if (length <= target) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (target - 1);
  const indices = new Set<number>();
  for (let i = 0; i < target; i++) indices.add(Math.round(i * step));
  return [...indices].sort((a, b) => a - b);
}

/** Rounds a raw step (e.g. "274 per tick") up to the nearest 1/2/5×10^n —
 * the standard "nice numbers" axis algorithm — so ticks land on round
 * dollar amounts instead of whatever the data's own range happens to
 * divide into. */
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual =
    residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return niceResidual * magnitude;
}

/** Evenly spaced, round-number y-axis ticks that always include zero —
 * e.g. "+$500/+$250/$0/−$250" instead of raw fraction-of-range labels like
 * "+$568/+$294/+$20/−$254". Both the data's actual min/max are always ≤/≥
 * the first/last tick (floor/ceil to the step), so the chart's plotted
 * range matches the axis exactly rather than needing separate padding. */
function buildYTicks(
  minValue: number,
  maxValue: number,
  targetTicks: number,
): number[] {
  const step = niceStep((maxValue - minValue) / targetTicks);
  const niceMin = Math.floor(minValue / step) * step;
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(v);
  return ticks;
}

/** Day-by-day or cumulative P/L, hand-rolled SVG — same convention as the
 * player research page's HistoryChart rather than a charting library.
 * Bar mode shows each day's own net P/L as a diverging bar off a zero
 * baseline (green above, red below); line mode shows the running total
 * instead, so the two modes answer "how did a given day go" vs. "how is
 * the whole bucket trending" without needing two separate data shapes.
 * Clicking a day (either mode) selects it via `onSelectDay` — the caller
 * uses that to filter the picks table to just that day, clicking the same
 * day again clears it. */
function PnlChart({
  days,
  mode,
  selectedDay,
  onSelectDay,
}: {
  days: DayPnl[];
  mode: ChartMode;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-foreground/72">
        No settled picks yet to chart.
      </p>
    );
  }

  const values =
    mode === "bar"
      ? days.map((d) => d.pnl)
      : days.reduce<number[]>((acc, d) => {
          acc.push((acc.at(-1) ?? 0) + d.pnl);
          return acc;
        }, []);

  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values, 1);
  // Round-number ticks (see buildYTicks) rather than raw fractions of the
  // data's own min/max — the chart's plotted range snaps to the same
  // min/max tick so the axis and the marks always agree exactly.
  const yTicks = buildYTicks(minValue, maxValue, 4);
  const scaleMin = yTicks[0];
  const scaleMax = yTicks[yTicks.length - 1];
  const scaleRange = scaleMax - scaleMin || 1;
  const valueToY = (v: number) =>
    PNL_CHART_HEIGHT - ((v - scaleMin) / scaleRange) * PNL_CHART_HEIGHT;
  const zeroY = valueToY(0);
  const barWidth = PNL_CHART_WIDTH / days.length;
  const xAt = (i: number) => i * barWidth;
  const hovered = hoverIndex !== null ? days[hoverIndex] : null;
  const hoveredValue = hoverIndex !== null ? values[hoverIndex] : null;
  // Cumulative P/L starts from a flat, even $0 baseline at the left edge —
  // without this anchor the line would open mid-air at day one's own
  // running total, which reads as if betting started already up or down.
  const linePoints = [
    mode === "line" ? `0,${zeroY}` : null,
    ...values.map((v, i) => `${xAt(i) + barWidth / 2},${valueToY(v)}`),
  ]
    .filter(Boolean)
    .join(" ");

  const xTickIndices = evenTickIndices(days.length, PNL_X_TICKS);

  const handleSelect = (day: string) =>
    onSelectDay(day === selectedDay ? null : day);

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 px-1 pt-2">
      <div className="relative text-right text-[9px] tabular-nums text-foreground/60">
        {yTicks.map((v) => (
          <span
            key={v}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${(valueToY(v) / PNL_CHART_HEIGHT) * 100}%` }}
          >
            {formatAxisMoney(v)}
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <div className="relative">
          <svg
            viewBox={`0 0 ${PNL_CHART_WIDTH} ${PNL_CHART_HEIGHT}`}
            className="w-full overflow-visible"
            style={{ aspectRatio: `${PNL_CHART_WIDTH} / ${PNL_CHART_HEIGHT}` }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {yTicks.map((v) => (
              <line
                key={v}
                x1="0"
                y1={valueToY(v)}
                x2={PNL_CHART_WIDTH}
                y2={valueToY(v)}
                stroke="var(--border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1="0"
              y1={zeroY}
              x2={PNL_CHART_WIDTH}
              y2={zeroY}
              stroke="var(--foreground)"
              strokeWidth={1}
              opacity={0.35}
              vectorEffect="non-scaling-stroke"
            />
            {mode === "bar" ? (
              days.map((d, i) => {
                const v = values[i];
                const y = Math.min(valueToY(v), zeroY);
                const barHeight = Math.max(Math.abs(valueToY(v) - zeroY), 1.5);
                const x = xAt(i) + barWidth * 0.18;
                const width = barWidth * 0.64;
                const isSelected = selectedDay === d.day;
                return (
                  <g
                    key={d.day}
                    onMouseEnter={() => setHoverIndex(i)}
                    onClick={() => handleSelect(d.day)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={xAt(i)}
                      y={0}
                      width={barWidth}
                      height={PNL_CHART_HEIGHT}
                      fill="transparent"
                    />
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={barHeight}
                      rx={1.5}
                      fill={
                        v >= 0
                          ? "var(--color-emerald-500, #10b981)"
                          : "var(--color-red-500, #ef4444)"
                      }
                      stroke={isSelected ? "var(--color-accent)" : "none"}
                      strokeWidth={isSelected ? 2 : 0}
                      opacity={
                        hoverIndex === null || hoverIndex === i || isSelected
                          ? 1
                          : 0.55
                      }
                    />
                  </g>
                );
              })
            ) : (
              <>
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                {days.map((d, i) => {
                  const isSelected = selectedDay === d.day;
                  return (
                    <g
                      key={d.day}
                      onMouseEnter={() => setHoverIndex(i)}
                      onClick={() => handleSelect(d.day)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={xAt(i)}
                        y={0}
                        width={barWidth}
                        height={PNL_CHART_HEIGHT}
                        fill="transparent"
                      />
                      {(hoverIndex === i || isSelected) && (
                        <circle
                          cx={xAt(i) + barWidth / 2}
                          cy={valueToY(values[i])}
                          r={isSelected ? 4.5 : 3.5}
                          fill="var(--color-accent)"
                          stroke={isSelected ? "var(--surface)" : "none"}
                          strokeWidth={isSelected ? 1.5 : 0}
                        />
                      )}
                    </g>
                  );
                })}
              </>
            )}
          </svg>
          {hovered && hoveredValue !== null && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
              style={{
                left: `${((xAt(hoverIndex!) + barWidth / 2) / PNL_CHART_WIDTH) * 100}%`,
                top: `${Math.max(0, (valueToY(hoveredValue) / PNL_CHART_HEIGHT) * 100 - 4)}%`,
              }}
            >
              <div
                className={`font-semibold ${hoveredValue >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {formatMoney(hoveredValue)}
              </div>
              <div className="text-foreground/72">
                {formatDayKey(hovered.day)}
              </div>
              {mode === "bar" && (
                <div className="text-foreground/60">
                  {hovered.count} pick{hovered.count === 1 ? "" : "s"}
                </div>
              )}
              <div className="text-accent">
                Click to{" "}
                {selectedDay === hovered.day ? "clear filter" : "filter table"}
              </div>
            </div>
          )}
        </div>
        <div className="relative mt-1 h-4">
          {xTickIndices.map((i) => {
            const pct = ((xAt(i) + barWidth / 2) / PNL_CHART_WIDTH) * 100;
            const isFirst = i === xTickIndices[0];
            const isLast = i === xTickIndices[xTickIndices.length - 1];
            return (
              <span
                key={i}
                className={`absolute text-[9px] text-foreground/60 ${isFirst ? "" : isLast ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${pct}%` }}
              >
                {formatDayKeyShort(days[i].day)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Small two-state segmented control, matching the toggle already used for
 * tab-like choices elsewhere on the betting page (src/app/betting/page.tsx's
 * own SegmentedToggle — kept as a local copy here since it's two tiny
 * buttons, not worth sharing across files for). */
function ChartModeToggle({
  value,
  onChange,
}: {
  value: ChartMode;
  onChange: (value: ChartMode) => void;
}) {
  const options: { value: ChartMode; label: string }[] = [
    { value: "bar", label: "Bar" },
    { value: "line", label: "Line" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border text-xs overflow-hidden">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-2.5 py-1 ${
            value === option.value
              ? "bg-accent text-accent-foreground"
              : "text-foreground/72 hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const PAGE_SIZE = 100;

function AccuracyVerificationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="max-w-3xl space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

// useParams requires a Suspense boundary so this route can still be
// prerendered up to it (see Next's "blocking-prerender-client-hook" guidance).
export default function AccuracyVerificationPage() {
  return (
    <Suspense fallback={<AccuracyVerificationSkeleton />}>
      <AccuracyVerificationContent />
    </Suspense>
  );
}

function AccuracyVerificationContent() {
  const { bucket } = useParams<{ bucket: string }>();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [unitSize, setUnitSize] = useState(100);
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["betting", "accuracy", bucket],
    queryFn: () => fetchVerification(bucket),
    enabled: Boolean(bucket),
  });

  const hitRatePct =
    data?.summary.hitRate !== null && data?.summary.hitRate !== undefined
      ? data.summary.hitRate * 100
      : null;
  const filteredPicks = useMemo(() => {
    if (!data) return [];
    if (!selectedDay) return data.picks;
    return data.picks.filter((p) => toDayKey(p.date) === selectedDay);
  }, [data, selectedDay]);
  const picks = useMemo(
    () => filteredPicks.slice(0, visible),
    [filteredPicks, visible],
  );
  // Net P/L across every graded pick (not just the currently-visible page),
  // so the summary tile always reflects the whole bucket regardless of how
  // far the "Show more" paging has gone.
  const netPnl = useMemo(() => {
    if (!data) return null;
    let total = 0;
    let settled = 0;
    for (const p of data.picks) {
      const pnl = settlePnl(p.odds, p.correct, unitSize);
      if (pnl !== null) {
        total += pnl;
        settled += 1;
      }
    }
    return settled > 0 ? { total, settled } : null;
  }, [data, unitSize]);
  const dailyPnl = useMemo(
    () => (data ? buildDailyPnl(data.picks, unitSize) : []),
    [data, unitSize],
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/betting" className="text-sm text-accent hover:underline">
          ← Back to Betting
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {data?.title ?? "Verify accuracy"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foreground/72">
          {METHODOLOGY[bucket] ?? ""}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <Skeleton className="h-20 w-40 rounded-lg" />
          </div>
          <div className="max-w-3xl space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" /> Failed to load this verification
          data.
        </p>
      )}

      {data && (
        <>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                {chartMode === "bar" ? "Daily P/L" : "Cumulative P/L"}
              </h2>
              <ChartModeToggle value={chartMode} onChange={setChartMode} />
            </div>
            <PnlChart
              days={dailyPnl}
              mode={chartMode}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </div>

          <div className="flex flex-wrap items-stretch gap-4 rounded-lg border border-border bg-surface p-4">
            <div className="min-w-[8rem] text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Hit rate
              </p>
              <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-foreground">
                {hitRatePct !== null ? `${hitRatePct.toFixed(0)}%` : "—"}
              </p>
            </div>
            <div className="min-w-[8rem] border-l border-border pl-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Correct
              </p>
              <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-foreground">
                {data.summary.correct}
              </p>
            </div>
            <div className="min-w-[8rem] border-l border-border pl-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Graded picks
              </p>
              <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-foreground">
                {data.summary.graded}
              </p>
            </div>
            <div className="min-w-[8rem] border-l border-border pl-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Net P/L
              </p>
              <p
                className={`font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums ${
                  netPnl === null
                    ? "text-foreground"
                    : netPnl.total > 0
                      ? "text-green-600 dark:text-green-400"
                      : netPnl.total < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground"
                }`}
              >
                {netPnl !== null ? formatMoney(netPnl.total) : "—"}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-1 border-l border-border pl-4">
              <label
                htmlFor="unit-size"
                className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60"
              >
                Unit size
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-foreground/60">$</span>
                <input
                  id="unit-size"
                  type="number"
                  min={1}
                  step={1}
                  value={unitSize}
                  onChange={(e) =>
                    setUnitSize(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-20 rounded-md border border-border bg-surface-muted px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <p className="flex-1 self-center text-xs text-foreground/60">
              This matches the number shown on the /betting accuracy strip
              exactly — every row below counted once toward it. P/L assumes
              every pick was bet at the same flat unit size, settled at the odds
              shown.
            </p>
          </div>

          {selectedDay && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-foreground/72">
                Showing {filteredPicks.length} pick
                {filteredPicks.length === 1 ? "" : "s"} from{" "}
                {formatDayKey(selectedDay)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground/72 hover:bg-surface-muted"
              >
                Clear filter
              </button>
            </div>
          )}

          {data.picks.length === 0 ? (
            <p className="text-foreground/72">
              No graded picks yet for this bucket.
            </p>
          ) : filteredPicks.length === 0 ? (
            <p className="text-foreground/72">No picks on this day.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left text-foreground/72">
                    <th className="px-3 py-2 font-normal">Date</th>
                    <th className="px-3 py-2 font-normal">Matchup / Player</th>
                    <th className="px-3 py-2 font-normal">Pick</th>
                    <th className="px-3 py-2 text-right font-normal">
                      Confidence
                    </th>
                    <th className="px-3 py-2 text-right font-normal">Odds</th>
                    <th className="px-3 py-2 text-right font-normal">
                      Projected
                    </th>
                    <th className="px-3 py-2 text-right font-normal">Actual</th>
                    <th className="px-3 py-2 text-center font-normal">
                      Result
                    </th>
                    <th className="px-3 py-2 text-right font-normal">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((p) => {
                    const pnl = settlePnl(p.odds, p.correct, unitSize);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-foreground/72 tabular-nums">
                          {formatDate(p.date)}
                        </td>
                        <td className="px-3 py-2">
                          {p.type === "prop" && p.playerId !== null ? (
                            <Link
                              href={`/betting/research/${p.playerId}?${new URLSearchParams(
                                {
                                  ...(p.statType ? { stat: p.statType } : {}),
                                  game: p.gameEspnId,
                                },
                              )}`}
                              className="hover:text-accent hover:underline"
                            >
                              {p.label}
                            </Link>
                          ) : (
                            <Link
                              href={`/games/${p.gameEspnId}`}
                              className="hover:text-accent hover:underline"
                            >
                              {p.label}
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground/72">
                          {p.pickDescription}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground/72">
                          {p.confidence ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground/72">
                          {p.odds ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground/72">
                          {p.projected}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground/72">
                          {p.actual}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {p.correct ? (
                            <Check className="inline h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <X className="inline h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            pnl === null
                              ? "text-foreground/72"
                              : pnl > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {pnl !== null ? formatMoney(pnl) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {visible < filteredPicks.length && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="rounded-md border border-border px-4 py-1.5 text-sm text-foreground/72 hover:bg-surface-muted"
              >
                Show more ({filteredPicks.length - visible} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
