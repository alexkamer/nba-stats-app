"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import {
  HIGH_CONFIDENCE_EDGE_RATIO,
  computeEdgeRatio,
} from "@lib/projections/confidence";
import { StatBlock, ComparisonBar } from "@/components/StatBlock";
import { CircularBadge } from "@/components/CircularBadge";

interface TeamSummary {
  id: number;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface PlayerPropLean {
  playerId: number;
  playerName: string;
  statType: string;
  projectedValue: number;
  // The line our pick was actually decided against — frozen once the
  // projection is made (see schema.prisma's PlayerPropProjection comment).
  // This is what grading, `bettable`, and Best Bets ranking all key off,
  // so it's the number shown as the pick itself even if the market's since
  // moved off it.
  line: number;
  // The market's current line for this side, only when it's moved off
  // `line` since our pick was made (null otherwise) — shown parenthetically
  // next to the pick as "(now oX.X)" so it's clear that's not the number
  // being graded, just what the book currently shows. The confidence meter
  // below still reads it, as a "here's the deal right now" figure distinct
  // from the frozen one everything else keys off.
  currentLine: number | null;
  lean: "OVER" | "UNDER" | "PUSH";
  // American odds for the side we're actually leaning (e.g. -121) — null
  // when that side's odds weren't captured.
  odds: number | null;
  // Lean/odds recomputed against today's live market line (`currentLine ??
  // line`) rather than the frozen one — can point at the other side from
  // `lean`/`odds` when the market's moved far enough to flip which side our
  // projection now favors. Only used for the Best Bets strip's "Current"
  // toggle state.
  currentLean: "OVER" | "UNDER" | "PUSH";
  currentOdds: number | null;
  // Whether our projection clears the line by enough relative to the
  // player's own recent variance to be worth calling out (see
  // lib/projections/confidence.ts) — this is what the page surfaces by
  // default, not every tracked prop.
  bettable: boolean;
  stdev: number | null;
  // Filled in once the game goes FINAL (see prediction-accuracy-tracking)
  // — null until then, never recomputed afterward, so this is always the
  // actual grading of the pick as it was made, not hindsight.
  gradedCorrect: boolean | null;
  gradedActualValue: number | null;
  // Game went FINAL but there's no box score for this player — they never
  // suited up, so this prop can never be graded.
  dnp: boolean;
  // Player is on the current injury report as "Out" — only ever set for a
  // game that hasn't been played yet (see /api/betting/upcoming).
  ruledOut: boolean;
  // Whether this prop is part of that day's locked-in Best Bets selection
  // (see src/lib/daily-best-bets.ts) — computed server-side and frozen the
  // first time that day's picks were requested, so the client never
  // re-ranks candidates itself and can't silently swap a pick out later
  // the same day.
  isBestBet: boolean;
  bestBetRank: number | null;
  // Same membership/rank idea as `isBestBet`/`bestBetRank`, but selected
  // against the live market line and recomputed on every request instead
  // of locked in — backs the Best Bets strip's "Current" toggle state.
  isBestBetCurrent: boolean;
  bestBetRankCurrent: number | null;
}

interface UpcomingGame {
  espnId: string;
  date: string;
  status: "SCHEDULED" | "LIVE" | "FINAL";
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  homeScore: number | null;
  awayScore: number | null;
  projection: {
    projectedHomeScore: number;
    projectedAwayScore: number;
    projectedMargin: number;
    spreadBettable: boolean;
    totalBettable: boolean;
    marginStdev: number | null;
    totalStdev: number | null;
    gradedCorrect: boolean | null;
    gradedSpreadCorrect: boolean | null;
    gradedTotalCorrect: boolean | null;
  } | null;
  market: {
    provider: string;
    spread: number | null;
    overUnder: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
    homeSpreadOdds: number | null;
    awaySpreadOdds: number | null;
    overOdds: number | null;
    underOdds: number | null;
  } | null;
  predictor: { homeWinPct: number; awayWinPct: number } | null;
  playerProps: PlayerPropLean[];
}

interface AccuracyBucket {
  graded: number;
  correct: number;
  hitRate: number | null;
  /** Net units a flat 1-unit-per-pick bettor would be up (or down) on this
   * bucket's season, settled at whatever odds were captured for the side
   * actually picked — `null` when nothing graded had odds to settle
   * against. See `computeAccuracyWithPnl` (lib/accuracy/compute-accuracy.ts). */
  unitsPnl: number | null;
}

interface AccuracySummary {
  ourModel: {
    game: AccuracyBucket;
    spread: AccuracyBucket;
    bettableSpread: AccuracyBucket;
    props: AccuracyBucket;
    bettableProps: AccuracyBucket;
    highConfidenceProps: AccuracyBucket;
    bestBets: AccuracyBucket;
    bestBetsCurrent: AccuracyBucket;
    overall: AccuracyBucket;
  };
  espnPredictor: AccuracyBucket;
  espnPredictorSpread: AccuracyBucket;
}

async function fetchUpcoming(date: string): Promise<UpcomingGame[]> {
  const res = await fetch(`/api/betting/upcoming?date=${date}`);
  if (!res.ok) throw new Error("Failed to load upcoming betting insights");
  const data = await res.json();
  return data.games;
}

/** Local (not UTC) YYYY-MM-DD for a date — matches the API route's own
 * local-day window, so "today" here always means the viewer's today. */
function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchAccuracy(): Promise<AccuracySummary> {
  const res = await fetch("/api/betting/accuracy");
  if (!res.ok) throw new Error("Failed to load accuracy summary");
  return res.json();
}

// Every tracked prop market, labeled for display and in column order for
// the player props table. DOUBLE_DOUBLE/TRIPLE_DOUBLE are omitted — they're
// binary yes/no props that ingest/generate-projections.ts deliberately
// never produces a line-based PlayerPropProjection for, so they never
// appear in a game's playerProps to begin with.
const STAT_LABELS: Record<string, string> = {
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
};

// Full names for the same stat types, shown instead of the abbreviations
// above once there's enough width for them (see the "Prop" column).
const STAT_LABELS_FULL: Record<string, string> = {
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
};

const PROP_STAT_TYPES = Object.keys(STAT_LABELS);

function formatSigned(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** American odds for the pick's own side, e.g. +150 / -110. */
function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** This app's own house notation for a line with a side (see the game
 * page's "Game Odds" panel), reused here for every over/under-shaped
 * number on this page. */
function formatLine(side: "OVER" | "UNDER" | "PUSH", line: number): string {
  const formatted = formatNumber(line);
  if (side === "PUSH") return formatted;
  return `${side === "OVER" ? "o" : "u"}${formatted}`;
}

/** A team's own spread (negative = favored), derived from a home-relative
 * margin — matches the sign convention the market's own `Odds.spread`
 * already uses (see ingest/mappers/odds.ts). */
function impliedSpread(homeRelativeMargin: number) {
  return { home: -homeRelativeMargin, away: homeRelativeMargin };
}

function totalLean(
  ourTotal: number,
  marketTotal: number,
): "OVER" | "UNDER" | "PUSH" {
  if (ourTotal > marketTotal) return "OVER";
  if (ourTotal < marketTotal) return "UNDER";
  return "PUSH";
}

/** Which side of the market's spread our own margin favors — home if we
 * think they'll beat the market's implied margin, away if we think they
 * won't clear it (i.e. the market is asking too many points of them).
 * This is deliberately NOT "whichever team we project to win outright" —
 * a team can be our own projected winner and still be the side we'd fade
 * against a market line (e.g. market has them -14.5, we have them by only
 * +6.4: the value side is the underdog getting +14.5, not the favorite). */
function spreadValueSide(
  ourMargin: number,
  marketMargin: number,
): "home" | "away" | null {
  if (ourMargin === marketMargin) return null;
  return ourMargin > marketMargin ? "home" : "away";
}

/** A prop worth recommending — clears the confidence bar AND is still a
 * live pick: not a no-show from a completed game (`dnp`), not a player
 * who's since been ruled out for one that hasn't been played yet
 * (`ruledOut`). Shared by every "recommended"-scoped view on this page
 * (best bets strip, picks count, a game's own recommended filter) so none
 * of them can disagree about which props actually count. */
function isRecommendedProp(p: PlayerPropLean): boolean {
  return p.bettable && !p.dnp && !p.ruledOut;
}

/** How many recommendations a game has to offer — spread, total, and
 * bettable player props combined. Shared by the game card's own "N picks"
 * badge and the page-level "Most picks" sort, so the two never disagree. */
function recommendedCount(game: UpcomingGame): number {
  const marketMarginValue =
    game.market?.spread != null ? -game.market.spread : null;
  const spreadValue =
    game.projection && marketMarginValue !== null
      ? spreadValueSide(game.projection.projectedMargin, marketMarginValue)
      : null;
  const showSpreadPick = Boolean(
    game.projection?.spreadBettable && spreadValue !== null,
  );
  return (
    (showSpreadPick ? 1 : 0) +
    (game.projection?.totalBettable ? 1 : 0) +
    game.playerProps.filter(isRecommendedProp).length
  );
}

/** Tiers a hit rate into the same green/amber/red language the rest of the
 * page uses for win/loss (see the `emerald`/`red` pair at line ~416) — green
 * once a rate clears a typical -110 breakeven (~52.4%), red once it's
 * meaningfully below a coin flip, amber in between. Gives every tile's
 * `ComparisonBar` a color instead of always defaulting to the flat accent,
 * so a glance at the strip shows which numbers are good without reading
 * every percentage. */
function hitRateColor(hitRate: number): string {
  if (hitRate >= 0.524) return "var(--color-emerald-500, #10b981)";
  if (hitRate < 0.45) return "var(--color-red-500, #ef4444)";
  return "var(--color-accent)";
}

/** "+42.6u" / "-3.2u" — a flat 1-unit-per-pick bettor's running total for
 * the bucket, in the same unit-denominated style the accuracy drill-down
 * page's own `formatMoney` uses for dollars. */
function formatUnits(unitsPnl: number): string {
  const sign = unitsPnl > 0 ? "+" : unitsPnl < 0 ? "−" : "";
  return `${sign}${Math.abs(unitsPnl).toFixed(1)}u`;
}

function AccuracyTile({
  href,
  label,
  summary,
}: {
  href: string;
  label: string;
  summary: AccuracyBucket;
}) {
  return (
    <StatBlock
      href={href}
      label={label}
      value={
        summary.hitRate !== null ? `${(summary.hitRate * 100).toFixed(0)}%` : null
      }
      caption={
        <>
          {summary.correct}/{summary.graded} graded
          {summary.unitsPnl !== null && (
            <>
              {" "}
              <span
                className={
                  summary.unitsPnl > 0
                    ? "text-green-600 dark:text-green-400"
                    : summary.unitsPnl < 0
                      ? "text-red-600 dark:text-red-400"
                      : ""
                }
              >
                ({formatUnits(summary.unitsPnl)})
              </span>
            </>
          )}
        </>
      }
      comparison={
        summary.hitRate !== null
          ? { pct: summary.hitRate * 100, color: hitRateColor(summary.hitRate) }
          : undefined
      }
    />
  );
}

/** Small uppercase group label above a row of tiles — same type scale as
 * `StatBlock`'s own label, just left-aligned and not centered over a
 * single tile, so a row of several tiles reads as one labeled group. */
function AccuracyGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
      {children}
    </p>
  );
}

function AccuracyStrip({ accuracy }: { accuracy: AccuracySummary }) {
  const nothingGraded =
    accuracy.ourModel.overall.graded === 0 &&
    accuracy.espnPredictor.graded === 0;
  if (nothingGraded) {
    return (
      <p className="text-sm text-foreground/72">
        No games have finished yet to grade our picks against — the scoreboard
        fills in as the season plays out.
      </p>
    );
  }
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="space-y-2">
        <AccuracyGroupLabel>Our model vs. ESPN&apos;s predictor</AccuracyGroupLabel>
        <div className="flex flex-wrap gap-2">
          <AccuracyTile
            href="/betting/accuracy/model"
            label="Our model, this season"
            summary={accuracy.ourModel.overall}
          />
          {accuracy.ourModel.game.graded > 0 && (
            <AccuracyTile
              href="/betting/accuracy/game-winners"
              label="Our model, game picks"
              summary={accuracy.ourModel.game}
            />
          )}
          <AccuracyTile
            href="/betting/accuracy/espn"
            label="ESPN's predictor"
            summary={accuracy.espnPredictor}
          />
          {accuracy.ourModel.spread.graded > 0 && (
            <AccuracyTile
              href="/betting/accuracy/spread-all"
              label="Our model, all spread picks"
              summary={accuracy.ourModel.spread}
            />
          )}
          {accuracy.espnPredictorSpread.graded > 0 && (
            <AccuracyTile
              href="/betting/accuracy/espn-spread"
              label="ESPN's predictor, spread"
              summary={accuracy.espnPredictorSpread}
            />
          )}
          {accuracy.ourModel.bettableSpread.graded > 0 && (
            <AccuracyTile
              href="/betting/accuracy/spread"
              label="Our model, spread picks"
              summary={accuracy.ourModel.bettableSpread}
            />
          )}
        </div>
      </div>

      {(accuracy.ourModel.bettableProps.graded > 0 ||
        accuracy.ourModel.highConfidenceProps.graded > 0 ||
        accuracy.ourModel.bestBets.graded > 0 ||
        accuracy.ourModel.bestBetsCurrent.graded > 0) && (
        <div className="space-y-2 border-t border-border pt-3">
          <AccuracyGroupLabel>Player props</AccuracyGroupLabel>
          <div className="flex flex-wrap gap-2">
            {accuracy.ourModel.bettableProps.graded > 0 && (
              <AccuracyTile
                href="/betting/accuracy/recommended"
                label="Our recommended props"
                summary={accuracy.ourModel.bettableProps}
              />
            )}
            {accuracy.ourModel.highConfidenceProps.graded > 0 && (
              <AccuracyTile
                href="/betting/accuracy/high-confidence"
                label={`High-confidence props (≥${HIGH_CONFIDENCE_EDGE_RATIO.toFixed(1)}σ)`}
                summary={accuracy.ourModel.highConfidenceProps}
              />
            )}
            {accuracy.ourModel.bestBets.graded > 0 && (
              <AccuracyTile
                href="/betting/accuracy/best-bets"
                label="Best bets"
                summary={accuracy.ourModel.bestBets}
              />
            )}
            {accuracy.ourModel.bestBetsCurrent.graded > 0 && (
              <AccuracyTile
                href="/betting/accuracy/best-bets-current"
                label="Best bets (current line)"
                summary={accuracy.ourModel.bestBetsCurrent}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Marks a pick whose edge over the line clears our confidence bar (see
 * lib/projections/confidence.ts) — the ones actually worth betting,
 * distinct from every number we project and track for grading. */
function BettableMark() {
  return (
    <CircularBadge
      alt="High-confidence pick"
      size="xs"
      className="ml-1"
      fallback={<span className="h-full w-full rounded-full bg-accent" />}
    />
  );
}

/** Hit/miss for a graded pick — renders nothing while `correct` is still
 * null (game hasn't gone FINAL and been graded yet). */
function ResultMark({ correct }: { correct: boolean | null }) {
  if (correct === null) return null;
  return (
    <CircularBadge
      alt={correct ? "Hit" : "Miss"}
      size="xs"
      className="ml-1"
      fallback={
        <span
          className={`flex h-full w-full items-center justify-center rounded-full text-[9px] font-bold text-white ${
            correct
              ? "bg-emerald-600 dark:bg-emerald-500"
              : "bg-red-600 dark:bg-red-500"
          }`}
        >
          {correct ? (
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          ) : (
            <X className="h-2.5 w-2.5" strokeWidth={3} />
          )}
        </span>
      }
    />
  );
}

function TeamLabel({ team }: { team: TeamSummary }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      <CircularBadge src={team.logoUrl} alt="" size="sm" />
      {team.abbreviation}
    </span>
  );
}

/** A confidence reading shown as a short filled bar rather than just the raw
 * σ number — lets a row's edge be read at a glance, the same visual
 * language used for every confidence figure on this page (the best-bets
 * strip, a game's own pick rows, and its player props table), backed by the
 * same `ComparisonBar` primitive `StatBlock` uses. Capped at 3σ: beyond that
 * the bar is already full and the exact number stops mattering for the
 * "how much better is this than that" comparison the bar is for. */
function ConfidenceMeter({
  edgeRatio,
  originalEdgeRatio,
  bettable,
}: {
  edgeRatio: number | null;
  // The edge our pick actually had when it was made, against the frozen
  // line — only passed where the line can move (player props). Shown
  // alongside `edgeRatio` as "was → now" whenever the market's moved
  // enough to actually change the number; the bar itself always reflects
  // `edgeRatio`, the deal available right now.
  originalEdgeRatio?: number | null;
  bettable: boolean;
}) {
  const pct = edgeRatio !== null ? Math.min(edgeRatio / 3, 1) * 100 : 0;
  const showBoth =
    edgeRatio !== null &&
    originalEdgeRatio != null &&
    Math.abs(originalEdgeRatio - edgeRatio) >= 0.05;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-8 shrink-0">
        <ComparisonBar
          pct={pct}
          color={bettable ? "var(--color-accent)" : "var(--color-border)"}
        />
      </span>
      <span
        className="text-xs text-foreground/60 tabular-nums"
        title={
          showBoth
            ? "Was the pick's edge when made; now is its edge at the current line"
            : undefined
        }
      >
        {edgeRatio === null
          ? "—"
          : showBoth
            ? `${originalEdgeRatio!.toFixed(1)}σ → ${edgeRatio.toFixed(1)}σ`
            : `${edgeRatio.toFixed(1)}σ`}
      </span>
    </span>
  );
}

/** One of a game's two headline picks (spread or total) — the visual
 * anchor of a game card. `mainLabel` null means there isn't enough history
 * to have a pick at all (distinct from having one that just isn't
 * confident enough to flag as bettable). */
function PickRow({
  label,
  mainLabel,
  odds,
  edgeRatio,
  bettable,
  graded,
}: {
  label: string;
  mainLabel: ReactNode | null;
  odds: number | null;
  edgeRatio: number | null;
  bettable: boolean;
  graded: boolean | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-foreground/60 w-14 shrink-0 pt-0.5">
        {label}
      </span>
      {mainLabel === null ? (
        <span className="text-sm text-foreground/60">
          Not enough history yet
        </span>
      ) : (
        <div className="flex flex-1 flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
          <span
            className={`text-base ${bettable ? "font-semibold text-foreground" : "text-foreground/82"}`}
          >
            {mainLabel}
          </span>
          <span className="flex items-center whitespace-nowrap">
            <span className="text-xs text-foreground/60 tabular-nums">
              {formatOdds(odds)}
            </span>
            {bettable && <BettableMark />}
            {graded !== null && <ResultMark correct={graded} />}
          </span>
          <ConfidenceMeter edgeRatio={edgeRatio} bettable={bettable} />
        </div>
      )}
    </div>
  );
}

/** Styled wrapper around a native <select> — keeps the browser's own
 * keyboard/touch handling rather than building a custom combobox, but
 * drops the default chrome so it reads as part of this app's own button
 * vocabulary (rounded-md border-border, hover:border-foreground/50) same
 * as the day-nav buttons, instead of generic OS select styling. */
function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-border bg-surface py-1 pl-2.5 pr-5 text-xs text-foreground hover:border-foreground/50 transition-colors"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-foreground/50">
        ▾
      </span>
    </div>
  );
}

/** The page's one hero element: the day's highest-confidence player props
 * across every game, as a horizontal row of scannable ticket chips — meant
 * to be the first thing a visitor reads, ahead of any individual game's
 * own (deliberately quieter) tables. */
type BestBetsLineMode = "initial" | "current";

function BestBetsStrip({
  games,
  isToday,
}: {
  games: UpcomingGame[];
  isToday: boolean;
}) {
  const [lineMode, setLineMode] = useState<BestBetsLineMode>("initial");

  // "Initial" membership and order come straight from the server's
  // locked-in selection (see src/lib/daily-best-bets.ts) rather than being
  // recomputed here — re-ranking candidates client-side is exactly what
  // let a pick get silently swapped out mid-day in the first place.
  // "Current" membership/order instead come from the server's live,
  // never-locked recomputation against today's actual market line
  // (`isBestBetCurrent`/`bestBetRankCurrent`) — this one's expected to
  // move as the market does, that's the point of the toggle.
  const picks = games
    .flatMap((game) =>
      game.playerProps
        .filter((p) =>
          lineMode === "initial" ? p.isBestBet : p.isBestBetCurrent,
        )
        .map((p) => ({
          ...p,
          matchup: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
          displayLine: lineMode === "initial" ? p.line : p.currentLine ?? p.line,
          displayLean: lineMode === "initial" ? p.lean : p.currentLean,
          displayOdds: lineMode === "initial" ? p.odds : p.currentOdds,
          rank: lineMode === "initial" ? p.bestBetRank : p.bestBetRankCurrent,
          // Display only (the σ figure below) — not used for membership or
          // order, both of which are decided server-side above.
          edgeRatio:
            computeEdgeRatio(
              p.projectedValue,
              p.currentLine ?? p.line,
              p.stdev,
            ) ?? 0,
          originalEdgeRatio: computeEdgeRatio(
            p.projectedValue,
            p.line,
            p.stdev,
          ),
        })),
    )
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground/72">
          {isToday ? "Today's" : "That day's"} best bets
        </p>
        <SegmentedToggle
          value={lineMode}
          onChange={setLineMode}
          options={[
            { value: "initial", label: "Initial" },
            { value: "current", label: "Current" },
          ]}
        />
      </div>
      {picks.length === 0 ? (
        <p className="text-sm text-foreground/60">
          No {lineMode === "current" ? "current" : ""} picks clear our
          confidence bar right now.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {picks.map((p) => (
            <Link
              key={`${p.playerId}-${p.statType}`}
              href={`/betting/research/${p.playerId}?stat=${p.statType}`}
              className="w-36 shrink-0 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-accent transition-colors"
            >
              <p className="truncate text-[10px] text-foreground/50">
                {p.matchup}
              </p>
              <p className="truncate text-xs text-foreground/72">
                {p.playerName}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {formatLine(p.displayLean, p.displayLine)} {STAT_LABELS[p.statType]}
              </p>
              {lineMode === "initial" && p.currentLine !== null && (
                <p
                  className="truncate text-[10px] text-foreground/50"
                  title={`The market's moved to ${formatLine(p.lean, p.currentLine)} since we made this pick — that's not what we're graded against`}
                >
                  Now {formatLine(p.lean, p.currentLine)}
                </p>
              )}
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-foreground/60 tabular-nums">
                  {formatOdds(p.displayOdds)}
                </span>
                {p.gradedCorrect !== null ? (
                  <span className="flex items-center gap-1 text-xs text-foreground/60 tabular-nums">
                    {p.gradedActualValue}
                    <ResultMark correct={p.gradedCorrect} />
                  </span>
                ) : (
                  <span
                    className="text-xs font-medium text-accent tabular-nums"
                    title={
                      lineMode === "initial" &&
                      p.originalEdgeRatio != null &&
                      Math.abs(p.originalEdgeRatio - p.edgeRatio) >= 0.05
                        ? "Was the pick's edge when made; now is its edge at the current line"
                        : undefined
                    }
                  >
                    {lineMode === "initial" &&
                    p.originalEdgeRatio != null &&
                    Math.abs(p.originalEdgeRatio - p.edgeRatio) >= 0.05
                      ? `${p.originalEdgeRatio.toFixed(1)}→${p.edgeRatio.toFixed(1)}σ`
                      : `${p.edgeRatio.toFixed(1)}σ`}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pulsing placeholder in the same card shape as a loaded GameCard, shown
 * while the day's games are still loading — keeps the loading state from
 * reading as a plain, unstyled "Loading…" line next to the rest of the
 * page's now-deliberate visual language. */
function GameCardSkeleton() {
  return (
    <div className="rounded-lg border border-border animate-pulse">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="h-4 w-32 rounded bg-surface-muted" />
        <div className="h-3 w-20 rounded bg-surface-muted" />
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="h-4 w-full rounded bg-surface-muted" />
        <div className="h-4 w-full rounded bg-surface-muted" />
      </div>
    </div>
  );
}

/** A small two-state segmented control, matching the toggle already used
 * for tab-like choices elsewhere in the app (see the game page's box
 * score/play-by-play switch). */
function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
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

function GameCard({ game }: { game: UpcomingGame }) {
  const [propsView, setPropsView] = useState<"all" | "recommended">(
    "recommended",
  );
  const [statFilter, setStatFilter] = useState<string>("all");
  const [playerFilter, setPlayerFilter] = useState<string>("all");

  const ourSpread = game.projection
    ? impliedSpread(game.projection.projectedMargin)
    : null;
  const marketSpread =
    game.market?.spread != null
      ? { home: game.market.spread, away: -game.market.spread }
      : null;
  const ourTotal = game.projection
    ? game.projection.projectedHomeScore + game.projection.projectedAwayScore
    : null;

  // The side our own margin favors against the market's line — not just
  // whichever team we project to win outright (see spreadValueSide). Only
  // marked when it clears the confidence bar; otherwise the two numbers
  // are shown for comparison without implying a recommendation either way.
  const marketMarginValue =
    game.market?.spread != null ? -game.market.spread : null;
  const spreadValue =
    game.projection && marketMarginValue !== null
      ? spreadValueSide(game.projection.projectedMargin, marketMarginValue)
      : null;
  const showSpreadPick = Boolean(
    game.projection?.spreadBettable && spreadValue !== null,
  );
  const spreadEdgeRatio =
    game.projection && marketMarginValue !== null
      ? computeEdgeRatio(
          game.projection.projectedMargin,
          marketMarginValue,
          game.projection.marginStdev,
        )
      : null;

  const ourTotalLean =
    ourTotal !== null && game.market?.overUnder != null
      ? totalLean(ourTotal, game.market.overUnder)
      : null;
  const totalEdgeRatio =
    ourTotal !== null && game.market?.overUnder != null
      ? computeEdgeRatio(
          ourTotal,
          game.market.overUnder,
          game.projection?.totalStdev ?? null,
        )
      : null;

  // Dropdown options, in a stable order — stat types that actually have a
  // prop for this game (PROP_STAT_TYPES' own order), players alphabetical.
  const statOptions = PROP_STAT_TYPES.filter((st) =>
    game.playerProps.some((p) => p.statType === st),
  );
  const playerOptions = [
    ...new Map(
      game.playerProps.map((p) => [p.playerId, p.playerName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const visibleProps = game.playerProps
    .filter((p) => propsView === "all" || isRecommendedProp(p))
    .filter((p) => statFilter === "all" || p.statType === statFilter)
    .filter(
      (p) => playerFilter === "all" || String(p.playerId) === playerFilter,
    )
    .sort((a, b) => {
      if (propsView === "recommended") {
        // Sorts by the same live-line confidence the meter displays, not
        // the frozen one membership/grading key off.
        const edgeA =
          computeEdgeRatio(
            a.projectedValue,
            a.currentLine ?? a.line,
            a.stdev,
          ) ?? -Infinity;
        const edgeB =
          computeEdgeRatio(
            b.projectedValue,
            b.currentLine ?? b.line,
            b.stdev,
          ) ?? -Infinity;
        if (edgeA !== edgeB) return edgeB - edgeA;
      }
      return (
        a.playerName.localeCompare(b.playerName) ||
        PROP_STAT_TYPES.indexOf(a.statType) -
          PROP_STAT_TYPES.indexOf(b.statType)
      );
    });

  const hasScores =
    game.status !== "SCHEDULED" &&
    game.awayScore != null &&
    game.homeScore != null;
  const awayLeading = hasScores && game.awayScore! > game.homeScore!;
  const homeLeading = hasScores && game.homeScore! > game.awayScore!;

  const picksCount = recommendedCount(game);

  return (
    <div
      id={`game-${game.espnId}`}
      className={`rounded-lg border ${game.status === "LIVE" ? "border-accent/50" : "border-border"}`}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5 text-sm">
          <span
            className={
              awayLeading || !hasScores
                ? "text-foreground"
                : "text-foreground/60"
            }
          >
            <TeamLabel team={game.awayTeam} />
          </span>
          {hasScores && (
            <span className="font-bold tabular-nums text-foreground">
              {game.awayScore}
            </span>
          )}
          <span className="text-foreground/50 text-xs">@</span>
          <span
            className={
              homeLeading || !hasScores
                ? "text-foreground"
                : "text-foreground/60"
            }
          >
            <TeamLabel team={game.homeTeam} />
          </span>
          {hasScores && (
            <span className="font-bold tabular-nums text-foreground">
              {game.homeScore}
            </span>
          )}
          {picksCount > 0 && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {picksCount} pick{picksCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 text-xs text-foreground/72">
          {game.status === "LIVE" && (
            <span className="inline-flex items-center gap-1 font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Live
            </span>
          )}
          {game.status === "FINAL"
            ? "Final"
            : game.status === "SCHEDULED" &&
              new Date(game.date).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        <PickRow
          label="Spread"
          mainLabel={
            ourSpread && marketSpread && spreadValue ? (
              <span className="inline-flex items-center gap-1.5">
                <TeamLabel
                  team={spreadValue === "home" ? game.homeTeam : game.awayTeam}
                />
                {formatSigned(
                  spreadValue === "home"
                    ? marketSpread.home
                    : marketSpread.away,
                )}
                <span className="text-sm font-normal text-foreground/60">
                  (
                  {formatSigned(
                    spreadValue === "home" ? ourSpread.home : ourSpread.away,
                  )}
                  )
                </span>
              </span>
            ) : null
          }
          odds={
            spreadValue === "home"
              ? (game.market?.homeSpreadOdds ?? null)
              : (game.market?.awaySpreadOdds ?? null)
          }
          edgeRatio={spreadEdgeRatio}
          bettable={showSpreadPick}
          graded={
            spreadValue !== null
              ? (game.projection?.gradedSpreadCorrect ?? null)
              : null
          }
        />
        <PickRow
          label="Total"
          mainLabel={
            ourTotal !== null ? (
              ourTotalLean && game.market?.overUnder != null ? (
                <span className="inline-flex items-center gap-1.5">
                  {formatLine(ourTotalLean, game.market.overUnder)}
                  <span className="text-sm font-normal text-foreground/60">
                    ({ourTotal.toFixed(1)})
                  </span>
                </span>
              ) : (
                ourTotal.toFixed(1)
              )
            ) : null
          }
          odds={
            ourTotalLean === "OVER"
              ? (game.market?.overOdds ?? null)
              : ourTotalLean === "UNDER"
                ? (game.market?.underOdds ?? null)
                : null
          }
          edgeRatio={totalEdgeRatio}
          bettable={Boolean(game.projection?.totalBettable)}
          graded={
            game.market?.overUnder != null
              ? (game.projection?.gradedTotalCorrect ?? null)
              : null
          }
        />
        <p className="text-xs text-foreground/60 pt-2 border-t border-border/60">
          Market{game.market ? ` (${game.market.provider})` : ""}:{" "}
          {marketSpread
            ? `${game.awayTeam.abbreviation} ${formatSigned(marketSpread.away)}`
            : "no line yet"}
          {game.market?.overUnder != null && ` · O/U ${game.market.overUnder}`}
          {game.predictor &&
            ` · ESPN: ${game.awayTeam.abbreviation} ${game.predictor.awayWinPct.toFixed(0)}% – ${game.homeTeam.abbreviation} ${game.predictor.homeWinPct.toFixed(0)}%`}
        </p>
      </div>

      {game.playerProps.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border mb-2">
            <span className="text-xs font-medium text-foreground/72">
              Player props
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect value={statFilter} onChange={setStatFilter}>
                <option value="all">All stats</option>
                {statOptions.map((statType) => (
                  <option key={statType} value={statType}>
                    {STAT_LABELS[statType]}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect value={playerFilter} onChange={setPlayerFilter}>
                <option value="all">All players</option>
                {playerOptions.map(([playerId, playerName]) => (
                  <option key={playerId} value={playerId}>
                    {playerName}
                  </option>
                ))}
              </FilterSelect>
              <SegmentedToggle
                value={propsView}
                onChange={setPropsView}
                options={[
                  { value: "recommended", label: "Recommended" },
                  { value: "all", label: "All" },
                ]}
              />
            </div>
          </div>
          {visibleProps.length === 0 ? (
            <p className="text-sm text-foreground/72">
              {propsView === "recommended"
                ? "No player props clear our confidence bar for this game."
                : "No player props match these filters."}
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-foreground/72">
                  <th className="pb-2 font-normal">Player</th>
                  <th className="pb-2 font-normal">Prop</th>
                  <th className="pb-2 text-right font-normal">Line</th>
                  <th className="pb-2 text-right font-normal">Odds</th>
                  <th className="pb-2 text-right font-normal">Our #</th>
                  <th className="pb-2 text-right font-normal">Confidence</th>
                  <th className="pb-2 text-right font-normal">Result</th>
                </tr>
              </thead>
              <tbody>
                {visibleProps.map((prop) => (
                  <tr
                    key={`${prop.playerId}-${prop.statType}`}
                    className={`border-t border-border/60 ${propsView === "all" && isRecommendedProp(prop) ? "bg-accent/10" : ""} ${
                      prop.dnp || prop.ruledOut ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-1.5 text-foreground/82">
                      <Link
                        href={`/betting/research/${prop.playerId}?stat=${prop.statType}`}
                        className="hover:text-accent"
                      >
                        {prop.playerName}
                      </Link>
                      {prop.ruledOut && (
                        <span className="ml-1.5 rounded bg-red-600/10 px-1 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          OUT
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-foreground/72">
                      <span className="sm:hidden">
                        {STAT_LABELS[prop.statType]}
                      </span>
                      <span className="hidden sm:inline">
                        {STAT_LABELS_FULL[prop.statType]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right">
                      <div>
                        <span
                          className={
                            isRecommendedProp(prop)
                              ? "font-semibold text-foreground"
                              : ""
                          }
                        >
                          {formatLine(prop.lean, prop.line)}
                        </span>
                        {isRecommendedProp(prop) && <BettableMark />}
                      </div>
                      {prop.currentLine !== null && (
                        <div
                          className="text-[10px] text-foreground/50"
                          title={`The market's moved to ${formatLine(prop.lean, prop.currentLine)} since we made this pick — that's not what we're graded against`}
                        >
                          Now {formatLine(prop.lean, prop.currentLine)}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-foreground/72">
                      {formatOdds(prop.odds)}
                    </td>
                    <td className="py-1.5 text-right text-foreground/72">
                      {prop.projectedValue.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-right">
                      {/* Shows "was → now" when the line's moved — the edge the
                          pick was actually made at vs. its edge at the current
                          line — unlike `bettable`/Best Bets membership just
                          below, which stay pinned to the frozen line. */}
                      <ConfidenceMeter
                        edgeRatio={computeEdgeRatio(
                          prop.projectedValue,
                          prop.currentLine ?? prop.line,
                          prop.stdev,
                        )}
                        originalEdgeRatio={computeEdgeRatio(
                          prop.projectedValue,
                          prop.line,
                          prop.stdev,
                        )}
                        bettable={isRecommendedProp(prop)}
                      />
                    </td>
                    <td className="py-1.5 text-right text-foreground/72">
                      {prop.dnp ? (
                        <span className="text-xs">DNP</span>
                      ) : prop.gradedCorrect !== null ? (
                        <>
                          <ResultMark correct={prop.gradedCorrect} />
                          <span className="text-xs">
                            {" "}
                            {prop.gradedActualValue}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Prev/next-day stepper plus a jump back to today — lets a user walk
 * back through past slates to see which picks hit vs. missed, without
 * leaving the page. Next day is disabled once at today: results-shaped
 * data for the future doesn't exist yet.
 *
 * Takes `isToday`/`onShift`/`onJumpToday` rather than computing "today"
 * itself — constructing `new Date()` during a client component's render
 * trips Next's blocking-prerender-current-time-client check, so the
 * caller derives "today" once in an effect and this component stays a
 * pure function of its props. */
function DayNav({
  date,
  isToday,
  onShift,
  onJumpToday,
}: {
  date: Date;
  isToday: boolean;
  onShift: (days: number) => void;
  onJumpToday: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => onShift(-1)}
        className="rounded-md border border-border px-2.5 py-1 hover:border-foreground/50"
      >
        ← Prev day
      </button>
      <span className="font-medium min-w-[8rem] text-center">
        {isToday
          ? "Today"
          : date.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
      </span>
      <button
        type="button"
        onClick={() => onShift(1)}
        disabled={isToday}
        className="rounded-md border border-border px-2.5 py-1 hover:border-foreground/50 disabled:opacity-40 disabled:hover:border-border"
      >
        Next day →
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={onJumpToday}
          className="text-accent hover:underline"
        >
          Jump to today
        </button>
      )}
    </div>
  );
}

/** Horizontal row of per-game jump links to this page's own "game-{espnId}"
 * anchors — those ids already existed on each GameCard but had nothing
 * linking to them. Only worth showing once there's more than one game to
 * jump between. */
function GameNav({ games }: { games: UpcomingGame[] }) {
  if (games.length < 2) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {games.map((game) => (
        <a
          key={game.espnId}
          href={`#game-${game.espnId}`}
          className="shrink-0 whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs text-foreground/72 hover:border-foreground/50 hover:text-foreground"
        >
          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
        </a>
      ))}
    </div>
  );
}

export default function BettingPage() {
  // "Today" is only known once this effect runs — computing `new Date()`
  // directly during render is flagged by Next as an unstable prerender
  // value (see Next's blocking-prerender-current-time-client guidance).
  // `dayOffset` (days away from today) needs no Date at all, so render
  // stays deterministic until `today` is set.
  const [today, setToday] = useState<Date | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [sortBy, setSortBy] = useState<"time" | "picks">("time");
  useEffect(() => {
    setToday(startOfToday());
  }, []);

  const selectedDate = today ? addDays(today, dayOffset) : null;
  const dateParam = selectedDate ? toDateParam(selectedDate) : null;
  const isToday = dayOffset === 0;

  const {
    data: games,
    isLoading: gamesLoading,
    error: gamesError,
  } = useQuery({
    queryKey: ["betting", "upcoming", dateParam],
    queryFn: () => fetchUpcoming(dateParam!),
    enabled: dateParam !== null,
  });
  const { data: accuracy } = useQuery({
    queryKey: ["betting", "accuracy"],
    queryFn: fetchAccuracy,
  });

  // Games already arrive in start-time order from the API — "time" needs
  // no re-sort, only "picks" (most recommendations first) does.
  const sortedGames =
    games && sortBy === "picks"
      ? [...games].sort((a, b) => recommendedCount(b) - recommendedCount(a))
      : games;

  if (!selectedDate) {
    return <p className="text-foreground/82">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Bettor&apos;s Heaven
          </h1>
          <p className="text-foreground/72 text-sm mt-1">
            {isToday
              ? "Our own projections for today's games and player props, measured against the market."
              : "How our picks actually did, graded against the final result."}
          </p>
        </div>
        <DayNav
          date={selectedDate}
          isToday={isToday}
          onShift={(days) => setDayOffset((offset) => offset + days)}
          onJumpToday={() => setDayOffset(0)}
        />
      </div>

      {games && games.length > 0 && (
        <BestBetsStrip games={games} isToday={isToday} />
      )}

      {accuracy && <AccuracyStrip accuracy={accuracy} />}

      {gamesError && (
        <p className="text-red-600 dark:text-red-400">
          Failed to load betting insights.
        </p>
      )}
      {games && games.length === 0 && (
        <p className="text-foreground/72">
          {isToday
            ? "No games scheduled today — check back on game day."
            : "No games that day."}
        </p>
      )}

      {games && games.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GameNav games={games} />
          <SegmentedToggle
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "time", label: "Start time" },
              { value: "picks", label: "Most picks" },
            ]}
          />
        </div>
      )}

      <div className="space-y-4">
        {gamesLoading
          ? Array.from({ length: 3 }, (_, i) => <GameCardSkeleton key={i} />)
          : sortedGames?.map((game) => (
              <GameCard key={game.espnId} game={game} />
            ))}
      </div>
    </div>
  );
}
