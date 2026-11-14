"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HIGH_CONFIDENCE_EDGE_RATIO,
  computeEdgeRatio,
} from "@lib/projections/confidence";
import { StatBlock } from "@/components/StatBlock";
import { KotcSpotlight, type KotcEntry } from "@/components/betting/BettingA";
import { PickBoard, RecordTiles, type BoardRow, type RecordTile } from "@/components/betting/PickBoard";

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
  // The player's last completed games for this stat, oldest first (see
  // /api/betting/upcoming) — only games before this one.
  recent: { value: number; date: string }[];
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
  kingOfTheCourt: AccuracyBucket;
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

interface KingOfTheCourtEntryRow {
  playerId: number;
  playerName: string;
  headshotUrl: string | null;
  projectedValue: number;
  rank: number;
  // Set once the date's actual leader is known and this entry's rank is 1
  // (see prediction-accuracy-tracking) — null for a non-rank-1 entry, or
  // for any entry on a date that hasn't been graded yet.
  gradedHit: boolean | null;
}

/** `null` when no leaderboard has been computed for that date (see
 * king-of-the-court-prediction) — same `/api/betting/upcoming` response
 * `fetchUpcoming` already reads `games` off of. */
async function fetchKingOfTheCourt(date: string): Promise<KingOfTheCourtEntryRow[] | null> {
  const res = await fetch(`/api/betting/upcoming?date=${date}`);
  if (!res.ok) throw new Error("Failed to load King of the Court leaderboard");
  const data = await res.json();
  return data.kingOfTheCourt;
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
  href?: string;
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
    accuracy.espnPredictor.graded === 0 &&
    accuracy.kingOfTheCourt.graded === 0;
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

      {accuracy.kingOfTheCourt.graded > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <AccuracyGroupLabel>King of the Court</AccuracyGroupLabel>
          <div className="flex flex-wrap gap-2">
            <AccuracyTile
              label="King of the Court picks"
              summary={accuracy.kingOfTheCourt}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** The page's one hero element: the day's highest-confidence player props
 * across every game, as a horizontal row of scannable ticket chips — meant
 * to be the first thing a visitor reads, ahead of any individual game's
 * own (deliberately quieter) tables. */
type BestBetsLineMode = "initial" | "current";

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


/** Layout-A pick board: every pick for the slate (a side of each game's
 * spread, each game's total, every player prop) as one flat list of rows. The
 * math and the rules for what counts as recommended are the ones GameCard and
 * BestBetsStrip already use, so the board can't disagree with them. With
 * `lineMode` "current", props are read against today's live market line. */
function toBoardRows(games: UpcomingGame[], lineMode: BestBetsLineMode): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const game of games) {
    const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;
    const base = { gameId: game.espnId, matchup, date: game.date, status: game.status };
    const proj = game.projection;
    const mkt = game.market;

    const marketMargin = mkt?.spread != null ? -mkt.spread : null;
    if (proj && mkt && marketMargin !== null) {
      const sideWon = spreadValueSide(proj.projectedMargin, marketMargin);
      if (sideWon) {
        const home = sideWon === "home";
        const team = home ? game.homeTeam : game.awayTeam;
        const line = home ? mkt.spread! : -mkt.spread!;
        const ours = home ? -proj.projectedMargin : proj.projectedMargin;
        rows.push({
          id: `${game.espnId}-spread`,
          kind: "spread",
          ...base,
          label: `${team.abbreviation} ${formatSigned(line)}`,
          market: "Spread",
          pickText: formatSigned(line),
          odds: formatOdds(home ? mkt.homeSpreadOdds : mkt.awaySpreadOdds),
          line,
          projected: ours,
          stdev: proj.marginStdev,
          edge: computeEdgeRatio(proj.projectedMargin, marketMargin, proj.marginStdev),
          edgeNow: null,
          recommended: proj.spreadBettable,
          isBestBet: false,
          bestBetRank: null,
          correct: proj.gradedSpreadCorrect,
          actual: null,
          nowLine: null,
          ruledOut: false,
          dnp: false,
          playerId: null,
          statType: null,
          recent: null,
        });
      }
    }

    if (proj && mkt?.overUnder != null) {
      const ourTotal = proj.projectedHomeScore + proj.projectedAwayScore;
      const lean = totalLean(ourTotal, mkt.overUnder);
      rows.push({
        id: `${game.espnId}-total`,
        kind: "total",
        ...base,
        label: "Game total",
        market: "Total",
        pickText: formatLine(lean, mkt.overUnder),
        odds: formatOdds(lean === "OVER" ? mkt.overOdds : lean === "UNDER" ? mkt.underOdds : null),
        line: mkt.overUnder,
        projected: ourTotal,
        stdev: proj.totalStdev,
        edge: computeEdgeRatio(ourTotal, mkt.overUnder, proj.totalStdev),
        edgeNow: null,
        recommended: proj.totalBettable,
        isBestBet: false,
        bestBetRank: null,
        correct: proj.gradedTotalCorrect,
        actual: null,
        nowLine: null,
        ruledOut: false,
        dnp: false,
        playerId: null,
        statType: null,
        recent: null,
      });
    }

    for (const p of game.playerProps) {
      const current = lineMode === "current";
      const line = current ? p.currentLine ?? p.line : p.line;
      const lean = current ? p.currentLean : p.lean;
      const odds = current ? p.currentOdds : p.odds;
      rows.push({
        id: `${game.espnId}-${p.playerId}-${p.statType}`,
        kind: "prop",
        ...base,
        label: p.playerName,
        market: STAT_LABELS[p.statType],
        pickText: formatLine(lean, line),
        odds: formatOdds(odds),
        line,
        projected: p.projectedValue,
        stdev: p.stdev,
        // The edge at the line the pick was made against (what grading and
        // best-bet membership key off); the live-line edge rides along for
        // the detail view when the market has moved.
        edge: computeEdgeRatio(p.projectedValue, line, p.stdev),
        edgeNow: !current && p.currentLine !== null ? computeEdgeRatio(p.projectedValue, p.currentLine, p.stdev) : null,
        recommended: isRecommendedProp(p),
        isBestBet: current ? p.isBestBetCurrent : p.isBestBet,
        bestBetRank: current ? p.bestBetRankCurrent : p.bestBetRank,
        correct: p.gradedCorrect,
        actual: p.gradedActualValue != null ? String(p.gradedActualValue) : null,
        nowLine: !current && p.currentLine !== null ? formatLine(p.lean, p.currentLine) : null,
        ruledOut: p.ruledOut,
        dnp: p.dnp,
        playerId: p.playerId,
        statType: p.statType,
        recent: p.recent,
      });
    }
  }
  return rows;
}

export default function BettingPage() {
  // "Today" is only known once this effect runs — computing `new Date()`
  // directly during render is flagged by Next as an unstable prerender
  // value (see Next's blocking-prerender-current-time-client guidance).
  // `dayOffset` (days away from today) needs no Date at all, so render
  // stays deterministic until `today` is set.
  const [today, setToday] = useState<Date | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [lineMode, setLineMode] = useState<BestBetsLineMode>("initial");
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
  const { data: kingOfTheCourt } = useQuery({
    queryKey: ["betting", "kingOfTheCourt", dateParam],
    queryFn: () => fetchKingOfTheCourt(dateParam!),
    enabled: dateParam !== null,
  });

  if (!selectedDate) {
    return <p className="text-foreground/82">Loading…</p>;
  }

  const rows = games ? toBoardRows(games, lineMode) : [];
  const kotc: KotcEntry[] = (kingOfTheCourt ?? []).slice(0, 10).map((e) => ({
    playerId: e.playerId,
    playerName: e.playerName,
    headshotUrl: e.headshotUrl,
    rank: e.rank,
    projected: e.projectedValue,
    hit: e.gradedHit,
  }));
  const tile = (label: string, href: string, b: AccuracyBucket): RecordTile => ({
    label,
    href,
    hitRate: b.hitRate,
    graded: b.graded,
    correct: b.correct,
    units: b.unitsPnl,
  });
  const tiles: RecordTile[] = accuracy
    ? [
        tile("Our model, this season", "/betting/accuracy/model", accuracy.ourModel.overall),
        tile("Best bets", "/betting/accuracy/best-bets", accuracy.ourModel.bestBets),
        tile("Recommended props", "/betting/accuracy/recommended", accuracy.ourModel.bettableProps),
        tile("ESPN's predictor", "/betting/accuracy/espn", accuracy.espnPredictor),
      ]
    : [];
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl leading-none">Betting</h1>
          <p className="mt-2 max-w-xl text-foreground/65">
            {isToday
              ? "Every pick our model makes today, ranked by how far it sits from the market."
              : "How that day's picks did, graded against the final result."}
          </p>
        </div>
        <DayNav date={selectedDate} isToday={isToday} onShift={(days) => setDayOffset((o) => o + days)} onJumpToday={() => setDayOffset(0)} />
      </header>

      {tiles.length > 0 && <RecordTiles tiles={tiles} />}

      {gamesLoading && <div aria-hidden="true" className="h-96 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />}
      {gamesError && <p className="text-loss">Couldn&apos;t load betting insights. Refresh the page to try again.</p>}
      {games && (
        <PickBoard rows={rows} lineMode={lineMode} onLineMode={setLineMode} />
      )}

      {kotc.length > 0 && (
        <section aria-labelledby="kotc-h" className="space-y-3">
          <h2 id="kotc-h" className="text-3xl">
            King of the Court
          </h2>
          <p className="text-foreground/65">The players projected to put up the most points, rebounds and assists combined.</p>
          <KotcSpotlight entries={kotc} />
        </section>
      )}

      {accuracy && (
        <details className="rounded-lg bg-surface p-4">
          <summary className="cursor-pointer text-lg font-semibold">Full track record</summary>
          <div className="mt-4">
            <AccuracyStrip accuracy={accuracy} />
          </div>
        </details>
      )}
    </div>
  );
}
