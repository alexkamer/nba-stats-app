"use client";

import { useMemo, useState } from "react";
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
  // Whether our projection clears the line by enough relative to the
  // player's own recent variance to be worth calling out (see
  // lib/projections/confidence.ts) — this is what the page surfaces by
  // default, not every tracked prop.
  bettable: boolean;
  stdev: number | null;
}

interface UpcomingGame {
  espnId: string;
  date: string;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  projection: {
    projectedHomeScore: number;
    projectedAwayScore: number;
    projectedMargin: number;
    spreadBettable: boolean;
    totalBettable: boolean;
    marginStdev: number | null;
    totalStdev: number | null;
  } | null;
  market: {
    provider: string;
    spread: number | null;
    overUnder: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
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

async function fetchUpcoming(): Promise<UpcomingGame[]> {
  const res = await fetch("/api/betting/upcoming");
  if (!res.ok) throw new Error("Failed to load upcoming betting insights");
  const data = await res.json();
  return data.games;
}

async function fetchAccuracy(): Promise<AccuracySummary> {
  const res = await fetch("/api/betting/accuracy");
  if (!res.ok) throw new Error("Failed to load accuracy summary");
  return res.json();
}

// Every tracked prop market, labeled for display. The six "CORE" ones are
// what a default scan of a game's props shows; the rest still surface in
// the Recommended Picks table if they clear the confidence bar.
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
  DOUBLE_DOUBLE: "DBL-DBL",
  TRIPLE_DOUBLE: "TRP-DBL",
};

const CORE_STAT_TYPES = ["POINTS", "REBOUNDS", "ASSISTS", "THREE_POINTERS_MADE", "STEALS", "BLOCKS"];

function formatSigned(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
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

type PickKind = "spread" | "total" | "prop";

interface RecommendedPick {
  key: string;
  kind: PickKind;
  game: UpcomingGame;
  label: string;
  statLabel: string;
  pickText: string;
  ourNumber: number;
  edgeRatio: number | null;
}

/** Every pick on the slate that clears the confidence bar (see
 * lib/projections/confidence.ts), across every game — spreads, totals, and
 * player props alike — sorted by how confident each one is. This is the
 * page's actual recommendation list; everything else is supporting detail. */
function buildRecommendedPicks(games: UpcomingGame[]): RecommendedPick[] {
  const picks: RecommendedPick[] = [];

  for (const game of games) {
    if (game.projection && game.market?.spread != null) {
      const marketMargin = -game.market.spread;
      const side = spreadValueSide(game.projection.projectedMargin, marketMargin);
      if (side !== null && game.projection.spreadBettable) {
        const team = side === "home" ? game.homeTeam : game.awayTeam;
        const marketSideSpread = side === "home" ? game.market.spread : -game.market.spread;
        const ourSideSpread = side === "home" ? -game.projection.projectedMargin : game.projection.projectedMargin;
        picks.push({
          key: `${game.espnId}-spread`,
          kind: "spread",
          game,
          label: team.abbreviation,
          statLabel: "Spread",
          pickText: formatSigned(marketSideSpread),
          ourNumber: ourSideSpread,
          edgeRatio: computeEdgeRatio(game.projection.projectedMargin, marketMargin, game.projection.marginStdev),
        });
      }
    }

    if (game.projection && game.market?.overUnder != null && game.projection.totalBettable) {
      const ourTotal = game.projection.projectedHomeScore + game.projection.projectedAwayScore;
      const lean = totalLean(ourTotal, game.market.overUnder);
      if (lean !== "PUSH") {
        picks.push({
          key: `${game.espnId}-total`,
          kind: "total",
          game,
          label: "Total",
          statLabel: "O/U",
          pickText: formatLine(lean, game.market.overUnder),
          ourNumber: ourTotal,
          edgeRatio: computeEdgeRatio(ourTotal, game.market.overUnder, game.projection.totalStdev),
        });
      }
    }

    for (const prop of game.playerProps) {
      if (!prop.bettable) continue;
      picks.push({
        key: `${game.espnId}-${prop.playerId}-${prop.statType}`,
        kind: "prop",
        game,
        label: prop.playerName,
        statLabel: STAT_LABELS[prop.statType] ?? prop.statType,
        pickText: formatLine(prop.lean, prop.line),
        ourNumber: prop.projectedValue,
        edgeRatio: computeEdgeRatio(prop.projectedValue, prop.line, prop.stdev),
      });
    }
  }

  return picks.sort((a, b) => (b.edgeRatio ?? 0) - (a.edgeRatio ?? 0));
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

function RecommendedPicksTable({ picks }: { picks: RecommendedPick[] }) {
  const [filter, setFilter] = useState<"all" | "game" | "prop">("all");
  const filtered = picks.filter((p) => {
    if (filter === "all") return true;
    if (filter === "game") return p.kind === "spread" || p.kind === "total";
    return p.kind === "prop";
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground/82">Recommended picks</h2>
        <SegmentedToggle
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "game", label: "Spread & total" },
            { value: "prop", label: "Props" },
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-foreground/72">
          Nothing clears our confidence bar yet for this filter — check back as more lines come in.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-foreground/72">
              <th className="pb-2 font-normal">Game</th>
              <th className="pb-2 font-normal">Market</th>
              <th className="pb-2 font-normal">Pick</th>
              <th className="pb-2 text-right font-normal">Line</th>
              <th className="pb-2 text-right font-normal">Our number</th>
              <th className="pb-2 text-right font-normal">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pick) => (
              <tr key={pick.key} className="border-t border-border/60">
                <td className="py-1.5">
                  <a href={`#game-${pick.game.espnId}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <TeamLabel team={pick.game.awayTeam} />
                    <span className="text-foreground/72">@</span>
                    <TeamLabel team={pick.game.homeTeam} />
                  </a>
                </td>
                <td className="py-1.5 text-foreground/72">{pick.statLabel}</td>
                <td className="py-1.5 font-medium">{pick.label}</td>
                <td className="py-1.5 text-right font-semibold">{pick.pickText}</td>
                <td className="py-1.5 text-right text-foreground/72">{pick.ourNumber.toFixed(1)}</td>
                <td className="py-1.5 text-right">
                  {pick.edgeRatio !== null ? <span className="text-accent font-medium">{pick.edgeRatio.toFixed(1)}σ</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GameCard({ game }: { game: UpcomingGame }) {
  const [propsView, setPropsView] = useState<"all" | "recommended">("all");

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

  const corePropsByPlayer = new Map<number, { name: string; cells: Map<string, PlayerPropLean> }>();
  for (const prop of game.playerProps) {
    if (!CORE_STAT_TYPES.includes(prop.statType)) continue;
    const entry = corePropsByPlayer.get(prop.playerId) ?? { name: prop.playerName, cells: new Map() };
    entry.cells.set(prop.statType, prop);
    corePropsByPlayer.set(prop.playerId, entry);
  }
  const allPlayers = [...corePropsByPlayer.values()];
  const visiblePlayers =
    propsView === "all" ? allPlayers : allPlayers.filter((p) => [...p.cells.values()].some((c) => c.bettable));

  return (
    <div id={`game-${game.espnId}`} className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TeamLabel team={game.awayTeam} />
          <span className="text-foreground/72">@</span>
          <TeamLabel team={game.homeTeam} />
        </div>
        <span className="text-xs text-foreground/72">
          {new Date(game.date).toLocaleString(undefined, {
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
                  <td className={`py-1.5 text-right ${showSpreadPick && spreadValue === "away" ? "font-semibold text-foreground" : ""}`}>
                    {formatSigned(ourSpread.away)}
                    {showSpreadPick && spreadValue === "away" && <BettableMark />}
                  </td>
                  <td className={`py-1.5 text-right ${showSpreadPick && spreadValue === "home" ? "font-semibold text-foreground" : ""}`}>
                    {formatSigned(ourSpread.home)}
                    {showSpreadPick && spreadValue === "home" && <BettableMark />}
                  </td>
                </>
              ) : (
                <td className="py-1.5 text-right text-foreground/72" colSpan={2}>
                  Not enough history yet
                </td>
              )}
              <td className="py-1.5 text-right pl-4">
                {ourTotal !== null
                  ? game.market?.overUnder != null
                    ? formatLine(totalLean(ourTotal, game.market.overUnder), ourTotal)
                    : ourTotal.toFixed(1)
                  : "—"}
                {game.projection?.totalBettable && <BettableMark />}
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

      {allPlayers.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between pt-3 border-t border-border mb-2">
            <span className="text-xs font-medium text-foreground/72">Player props</span>
            <SegmentedToggle
              value={propsView}
              onChange={setPropsView}
              options={[
                { value: "all", label: "All players" },
                { value: "recommended", label: "Recommended only" },
              ]}
            />
          </div>
          {visiblePlayers.length === 0 ? (
            <p className="text-sm text-foreground/72">No player props clear our confidence bar for this game.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-foreground/72">
                  <th className="pb-2 font-normal">Player</th>
                  {CORE_STAT_TYPES.map((statType) => (
                    <th key={statType} className="pb-2 text-right font-normal">
                      {STAT_LABELS[statType]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((player) => (
                  <tr key={player.name} className="border-t border-border/60">
                    <td className="py-1.5 text-foreground/82">{player.name}</td>
                    {CORE_STAT_TYPES.map((statType) => {
                      const prop = player.cells.get(statType);
                      return (
                        <td key={statType} className="py-1.5 text-right">
                          {prop ? (
                            <>
                              <span className={prop.bettable ? "font-semibold text-foreground" : ""}>
                                {formatLine(prop.lean, prop.line)}
                              </span>{" "}
                              <span className="text-foreground/72 text-xs">({prop.projectedValue.toFixed(1)})</span>
                              {prop.bettable && <BettableMark />}
                            </>
                          ) : (
                            <span className="text-foreground/72">—</span>
                          )}
                        </td>
                      );
                    })}
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

export default function BettingPage() {
  const {
    data: games,
    isLoading: gamesLoading,
    error: gamesError,
  } = useQuery({ queryKey: ["betting", "upcoming"], queryFn: fetchUpcoming });
  const { data: accuracy } = useQuery({ queryKey: ["betting", "accuracy"], queryFn: fetchAccuracy });

  const recommendedPicks = useMemo(() => (games ? buildRecommendedPicks(games) : []), [games]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bettor&apos;s Heaven</h1>
        <p className="text-foreground/72 text-sm mt-1">
          Our own projections for today&apos;s games and player props, measured against the market.
        </p>
      </div>

      {accuracy && <AccuracyStrip accuracy={accuracy} />}

      {gamesLoading && <p className="text-foreground/82">Loading…</p>}
      {gamesError && <p className="text-red-600 dark:text-red-400">Failed to load betting insights.</p>}
      {games && games.length === 0 && (
        <p className="text-foreground/72">No games scheduled today — check back on game day.</p>
      )}

      {games && games.length > 0 && <RecommendedPicksTable picks={recommendedPicks} />}

      <div className="space-y-4">
        {games?.map((game) => (
          <GameCard key={game.espnId} game={game} />
        ))}
      </div>
    </div>
  );
}
