"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { computeEdgeRatio } from "@lib/projections/confidence";

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
  line: number;
  lean: "OVER" | "UNDER" | "PUSH";
  // American odds for the side we're actually leaning (e.g. -121) — null
  // when that side's odds weren't captured.
  odds: number | null;
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
}

interface AccuracySummary {
  ourModel: { game: AccuracyBucket; props: AccuracyBucket; bettableProps: AccuracyBucket; overall: AccuracyBucket };
  espnPredictor: AccuracyBucket;
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

/** This app's own house notation for a line with a side (see the game
 * page's "Game Odds" panel), reused here for every over/under-shaped
 * number on this page. */
function formatLine(side: "OVER" | "UNDER" | "PUSH", line: number): string {
  const formatted = Number.isInteger(line) ? `${line}` : line.toFixed(1);
  if (side === "PUSH") return formatted;
  return `${side === "OVER" ? "o" : "u"}${formatted}`;
}

/** A team's own spread (negative = favored), derived from a home-relative
 * margin — matches the sign convention the market's own `Odds.spread`
 * already uses (see ingest/mappers/odds.ts). */
function impliedSpread(homeRelativeMargin: number) {
  return { home: -homeRelativeMargin, away: homeRelativeMargin };
}

function totalLean(ourTotal: number, marketTotal: number): "OVER" | "UNDER" | "PUSH" {
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
function spreadValueSide(ourMargin: number, marketMargin: number): "home" | "away" | null {
  if (ourMargin === marketMargin) return null;
  return ourMargin > marketMargin ? "home" : "away";
}

function AccuracyStrip({ accuracy }: { accuracy: AccuracySummary }) {
  const nothingGraded = accuracy.ourModel.overall.graded === 0 && accuracy.espnPredictor.graded === 0;
  if (nothingGraded) {
    return (
      <p className="text-sm text-foreground/72">
        No games have finished yet to grade our picks against — the scoreboard fills in as the season plays out.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 text-sm">
      <span>
        <span className="text-foreground/72">Our model, this season </span>
        <span className="font-medium">
          {accuracy.ourModel.overall.hitRate !== null ? `${(accuracy.ourModel.overall.hitRate * 100).toFixed(0)}%` : "—"}
        </span>
        <span className="text-foreground/72"> ({accuracy.ourModel.overall.correct}/{accuracy.ourModel.overall.graded})</span>
      </span>
      <span>
        <span className="text-foreground/72">ESPN&apos;s predictor </span>
        <span className="font-medium">
          {accuracy.espnPredictor.hitRate !== null ? `${(accuracy.espnPredictor.hitRate * 100).toFixed(0)}%` : "—"}
        </span>
        <span className="text-foreground/72"> ({accuracy.espnPredictor.correct}/{accuracy.espnPredictor.graded})</span>
      </span>
      {accuracy.ourModel.bettableProps.graded > 0 && (
        <span>
          <span className="text-foreground/72">Our high-confidence props </span>
          <span className="font-medium">
            {accuracy.ourModel.bettableProps.hitRate !== null
              ? `${(accuracy.ourModel.bettableProps.hitRate * 100).toFixed(0)}%`
              : "—"}
          </span>
          <span className="text-foreground/72">
            {" "}
            ({accuracy.ourModel.bettableProps.correct}/{accuracy.ourModel.bettableProps.graded})
          </span>
        </span>
      )}
    </div>
  );
}

/** Marks a pick whose edge over the line clears our confidence bar (see
 * lib/projections/confidence.ts) — the ones actually worth betting,
 * distinct from every number we project and track for grading. */
function BettableMark() {
  return (
    <span className="ml-1 text-accent" title="High-confidence pick" aria-label="High-confidence pick">
      ●
    </span>
  );
}

/** Hit/miss for a graded pick — renders nothing while `correct` is still
 * null (game hasn't gone FINAL and been graded yet). */
function ResultMark({ correct }: { correct: boolean | null }) {
  if (correct === null) return null;
  return correct ? (
    <span className="ml-1 text-emerald-600 dark:text-emerald-400" title="Hit" aria-label="Hit">
      ✓
    </span>
  ) : (
    <span className="ml-1 text-red-600 dark:text-red-400" title="Miss" aria-label="Miss">
      ✗
    </span>
  );
}

function TeamLabel({ team }: { team: TeamSummary }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {team.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logoUrl} alt="" className="h-4 w-4" />
      )}
      {team.abbreviation}
    </span>
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
            value === option.value ? "bg-accent text-accent-foreground" : "text-foreground/72 hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GameCard({ game }: { game: UpcomingGame }) {
  const [propsView, setPropsView] = useState<"all" | "recommended">("recommended");
  const [statFilter, setStatFilter] = useState<string>("all");
  const [playerFilter, setPlayerFilter] = useState<string>("all");

  const ourSpread = game.projection ? impliedSpread(game.projection.projectedMargin) : null;
  const marketSpread =
    game.market?.spread != null ? { home: game.market.spread, away: -game.market.spread } : null;
  const ourTotal = game.projection ? game.projection.projectedHomeScore + game.projection.projectedAwayScore : null;

  // The side our own margin favors against the market's line — not just
  // whichever team we project to win outright (see spreadValueSide). Only
  // marked when it clears the confidence bar; otherwise the two numbers
  // are shown for comparison without implying a recommendation either way.
  const marketMarginValue = game.market?.spread != null ? -game.market.spread : null;
  const spreadValue =
    game.projection && marketMarginValue !== null
      ? spreadValueSide(game.projection.projectedMargin, marketMarginValue)
      : null;
  const showSpreadPick = Boolean(game.projection?.spreadBettable && spreadValue !== null);

  // Dropdown options, in a stable order — stat types that actually have a
  // prop for this game (PROP_STAT_TYPES' own order), players alphabetical.
  const statOptions = PROP_STAT_TYPES.filter((st) => game.playerProps.some((p) => p.statType === st));
  const playerOptions = [...new Map(game.playerProps.map((p) => [p.playerId, p.playerName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const visibleProps = game.playerProps
    .filter((p) => propsView === "all" || p.bettable)
    .filter((p) => statFilter === "all" || p.statType === statFilter)
    .filter((p) => playerFilter === "all" || String(p.playerId) === playerFilter)
    .sort((a, b) => {
      if (propsView === "recommended") {
        const edgeA = computeEdgeRatio(a.projectedValue, a.line, a.stdev) ?? -Infinity;
        const edgeB = computeEdgeRatio(b.projectedValue, b.line, b.stdev) ?? -Infinity;
        if (edgeA !== edgeB) return edgeB - edgeA;
      }
      return a.playerName.localeCompare(b.playerName) || PROP_STAT_TYPES.indexOf(a.statType) - PROP_STAT_TYPES.indexOf(b.statType);
    });

  return (
    <div id={`game-${game.espnId}`} className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TeamLabel team={game.awayTeam} />
          <span className="text-foreground/72">@</span>
          <TeamLabel team={game.homeTeam} />
        </div>
        <span className="text-xs text-foreground/72">
          {game.status === "FINAL" && game.awayScore != null && game.homeScore != null
            ? `Final ${game.awayScore}-${game.homeScore}`
            : new Date(game.date).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
        </span>
      </div>

      <div className="px-4 py-3">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-foreground/72">
              <th className="pb-2 font-normal" />
              <th className="pb-2 text-right font-normal">{game.awayTeam.abbreviation}</th>
              <th className="pb-2 text-right font-normal">{game.homeTeam.abbreviation}</th>
              <th className="pb-2 text-right font-normal pl-4">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/60">
              <td className="py-1.5 text-foreground/82">Our pick</td>
              {ourSpread ? (
                <>
                  <td
                    className={`py-1.5 text-right ${showSpreadPick && spreadValue === "away" ? "font-semibold text-foreground bg-accent/10" : ""}`}
                  >
                    {formatSigned(ourSpread.away)}
                    {spreadValue === "away" && (
                      <span className="text-foreground/60 text-xs"> {formatOdds(game.market?.awaySpreadOdds ?? null)}</span>
                    )}
                    {showSpreadPick && spreadValue === "away" && <BettableMark />}
                    {spreadValue === "away" && <ResultMark correct={game.projection?.gradedSpreadCorrect ?? null} />}
                  </td>
                  <td
                    className={`py-1.5 text-right ${showSpreadPick && spreadValue === "home" ? "font-semibold text-foreground bg-accent/10" : ""}`}
                  >
                    {formatSigned(ourSpread.home)}
                    {spreadValue === "home" && (
                      <span className="text-foreground/60 text-xs"> {formatOdds(game.market?.homeSpreadOdds ?? null)}</span>
                    )}
                    {showSpreadPick && spreadValue === "home" && <BettableMark />}
                    {spreadValue === "home" && <ResultMark correct={game.projection?.gradedSpreadCorrect ?? null} />}
                  </td>
                </>
              ) : (
                <td className="py-1.5 text-right text-foreground/72" colSpan={2}>
                  Not enough history yet
                </td>
              )}
              <td className={`py-1.5 text-right pl-4 ${game.projection?.totalBettable ? "bg-accent/10" : ""}`}>
                {ourTotal !== null
                  ? game.market?.overUnder != null
                    ? formatLine(totalLean(ourTotal, game.market.overUnder), ourTotal)
                    : ourTotal.toFixed(1)
                  : "—"}
                {ourTotal !== null && game.market?.overUnder != null && (
                  <span className="text-foreground/60 text-xs">
                    {" "}
                    {formatOdds(
                      totalLean(ourTotal, game.market.overUnder) === "OVER" ? game.market.overOdds : game.market.underOdds,
                    )}
                  </span>
                )}
                {game.projection?.totalBettable && <BettableMark />}
                {game.market?.overUnder != null && <ResultMark correct={game.projection?.gradedTotalCorrect ?? null} />}
              </td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="py-1.5 text-foreground/82">Market{game.market ? ` (${game.market.provider})` : ""}</td>
              {marketSpread ? (
                <>
                  <td className={`py-1.5 text-right ${marketSpread.away < 0 ? "font-semibold text-foreground" : ""}`}>
                    {formatSigned(marketSpread.away)}
                  </td>
                  <td className={`py-1.5 text-right ${marketSpread.home < 0 ? "font-semibold text-foreground" : ""}`}>
                    {formatSigned(marketSpread.home)}
                  </td>
                </>
              ) : (
                <td className="py-1.5 text-right text-foreground/72" colSpan={2}>
                  No line yet
                </td>
              )}
              <td className="py-1.5 text-right pl-4">{game.market?.overUnder ?? "—"}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="py-1.5 text-foreground/82">ESPN predictor</td>
              {game.predictor ? (
                <>
                  <td
                    className={`py-1.5 text-right ${
                      game.predictor.awayWinPct > game.predictor.homeWinPct ? "font-semibold text-foreground" : ""
                    }`}
                  >
                    {game.predictor.awayWinPct.toFixed(0)}%
                  </td>
                  <td
                    className={`py-1.5 text-right ${
                      game.predictor.homeWinPct > game.predictor.awayWinPct ? "font-semibold text-foreground" : ""
                    }`}
                  >
                    {game.predictor.homeWinPct.toFixed(0)}%
                  </td>
                </>
              ) : (
                <td className="py-1.5 text-right text-foreground/72" colSpan={2}>
                  Unavailable
                </td>
              )}
              <td className="py-1.5 text-right pl-4 text-foreground/72">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {game.playerProps.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border mb-2">
            <span className="text-xs font-medium text-foreground/72">Player props</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statFilter}
                onChange={(e) => setStatFilter(e.target.value)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              >
                <option value="all">All stats</option>
                {statOptions.map((statType) => (
                  <option key={statType} value={statType}>
                    {STAT_LABELS[statType]}
                  </option>
                ))}
              </select>
              <select
                value={playerFilter}
                onChange={(e) => setPlayerFilter(e.target.value)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              >
                <option value="all">All players</option>
                {playerOptions.map(([playerId, playerName]) => (
                  <option key={playerId} value={playerId}>
                    {playerName}
                  </option>
                ))}
              </select>
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
              {propsView === "recommended" ? "No player props clear our confidence bar for this game." : "No player props match these filters."}
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
                  <tr key={`${prop.playerId}-${prop.statType}`} className={`border-t border-border/60 ${prop.bettable ? "bg-accent/10" : ""}`}>
                    <td className="py-1.5 text-foreground/82">
                      <Link href={`/betting/research/${prop.playerId}?stat=${prop.statType}`} className="hover:text-accent">
                        {prop.playerName}
                      </Link>
                    </td>
                    <td className="py-1.5 text-foreground/72">{STAT_LABELS[prop.statType]}</td>
                    <td className="py-1.5 text-right">
                      <span className={prop.bettable ? "font-semibold text-foreground" : ""}>
                        {formatLine(prop.lean, prop.line)}
                      </span>
                      {prop.bettable && <BettableMark />}
                    </td>
                    <td className="py-1.5 text-right text-foreground/72">{formatOdds(prop.odds)}</td>
                    <td className="py-1.5 text-right text-foreground/72">{prop.projectedValue.toFixed(1)}</td>
                    <td className="py-1.5 text-right text-foreground/72">
                      {(() => {
                        const ratio = computeEdgeRatio(prop.projectedValue, prop.line, prop.stdev);
                        return ratio !== null ? `${ratio.toFixed(1)}σ` : "—";
                      })()}
                    </td>
                    <td className="py-1.5 text-right text-foreground/72">
                      {prop.gradedCorrect !== null ? (
                        <>
                          <ResultMark correct={prop.gradedCorrect} />
                          <span className="text-xs"> {prop.gradedActualValue}</span>
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
        {isToday ? "Today" : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
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
        <button type="button" onClick={onJumpToday} className="text-accent hover:underline">
          Jump to today
        </button>
      )}
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
  const { data: accuracy } = useQuery({ queryKey: ["betting", "accuracy"], queryFn: fetchAccuracy });

  if (!selectedDate) {
    return <p className="text-foreground/82">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bettor&apos;s Heaven</h1>
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

      {accuracy && <AccuracyStrip accuracy={accuracy} />}

      {gamesLoading && <p className="text-foreground/82">Loading…</p>}
      {gamesError && <p className="text-red-600 dark:text-red-400">Failed to load betting insights.</p>}
      {games && games.length === 0 && (
        <p className="text-foreground/72">
          {isToday ? "No games scheduled today — check back on game day." : "No games that day."}
        </p>
      )}

      <div className="space-y-4">
        {games?.map((game) => (
          <GameCard key={game.espnId} game={game} />
        ))}
      </div>
    </div>
  );
}
