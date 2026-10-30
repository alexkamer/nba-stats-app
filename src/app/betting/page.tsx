"use client";

import { useQuery } from "@tanstack/react-query";

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
}

interface UpcomingGame {
  espnId: string;
  date: string;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  projection: { projectedHomeScore: number; projectedAwayScore: number; projectedMargin: number } | null;
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
  ourModel: { game: AccuracyBucket; props: AccuracyBucket; overall: AccuracyBucket };
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

// The six stats a bettor actually shops for. Combos, milestones, and
// double/triple-double props are still computed and served by the API —
// they're just not what belongs in a default scan of the slate.
const CORE_STATS: { type: string; label: string }[] = [
  { type: "POINTS", label: "PTS" },
  { type: "REBOUNDS", label: "REB" },
  { type: "ASSISTS", label: "AST" },
  { type: "THREE_POINTERS_MADE", label: "3PM" },
  { type: "STEALS", label: "STL" },
  { type: "BLOCKS", label: "BLK" },
];

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

interface BiggestEdge {
  game: UpcomingGame;
  team: TeamSummary;
  ourSpread: number;
  marketSpread: number;
  gap: number;
}

/** The single largest disagreement between our spread and the market's,
 * across all listed games — the one opinion this page leads with. */
function findBiggestEdge(games: UpcomingGame[]): BiggestEdge | null {
  let best: BiggestEdge | null = null;
  for (const game of games) {
    if (!game.projection || game.market?.spread == null) continue;
    const ours = impliedSpread(game.projection.projectedMargin);
    const market = { home: game.market.spread, away: -game.market.spread };
    for (const [team, ourSpread, marketSpread] of [
      [game.homeTeam, ours.home, market.home],
      [game.awayTeam, ours.away, market.away],
    ] as const) {
      const gap = Math.abs(ourSpread - marketSpread);
      if (!best || gap > best.gap) best = { game, team, ourSpread, marketSpread, gap };
    }
  }
  return best;
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
    </div>
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

function GameCard({ game }: { game: UpcomingGame }) {
  const ourSpread = game.projection ? impliedSpread(game.projection.projectedMargin) : null;
  const marketSpread =
    game.market?.spread != null ? { home: game.market.spread, away: -game.market.spread } : null;
  const ourTotal = game.projection ? game.projection.projectedHomeScore + game.projection.projectedAwayScore : null;

  const corePropsByPlayer = new Map<number, { name: string; cells: Map<string, PlayerPropLean> }>();
  for (const prop of game.playerProps) {
    if (!CORE_STATS.some((s) => s.type === prop.statType)) continue;
    const entry = corePropsByPlayer.get(prop.playerId) ?? { name: prop.playerName, cells: new Map() };
    entry.cells.set(prop.statType, prop);
    corePropsByPlayer.set(prop.playerId, entry);
  }

  return (
    <div className="rounded-lg border border-border">
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
                  <td className={`py-1.5 text-right ${ourSpread.away < 0 ? "font-semibold text-foreground" : ""}`}>
                    {formatSigned(ourSpread.away)}
                  </td>
                  <td className={`py-1.5 text-right ${ourSpread.home < 0 ? "font-semibold text-foreground" : ""}`}>
                    {formatSigned(ourSpread.home)}
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

      {corePropsByPlayer.size > 0 && (
        <div className="px-4 pb-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-foreground/72 border-t border-border">
                <th className="pt-3 pb-2 font-normal">Player</th>
                {CORE_STATS.map((stat) => (
                  <th key={stat.type} className="pt-3 pb-2 text-right font-normal">
                    {stat.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...corePropsByPlayer.values()].map((player) => (
                <tr key={player.name} className="border-t border-border/60">
                  <td className="py-1.5 text-foreground/82">{player.name}</td>
                  {CORE_STATS.map((stat) => {
                    const prop = player.cells.get(stat.type);
                    return (
                      <td key={stat.type} className="py-1.5 text-right">
                        {prop ? (
                          <>
                            {formatLine(prop.lean, prop.line)}{" "}
                            <span className="text-foreground/72 text-xs">({prop.projectedValue.toFixed(1)})</span>
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

  const biggestEdge = games ? findBiggestEdge(games) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bettor&apos;s Heaven</h1>
        <p className="text-foreground/72 text-sm mt-1">
          Our own projections for upcoming games and player props, measured against the market.
        </p>
      </div>

      {biggestEdge && (
        <p className="text-sm">
          Biggest gap tonight: we have <TeamLabel team={biggestEdge.team} /> at{" "}
          <span className="font-semibold">{formatSigned(biggestEdge.ourSpread)}</span>, the market has them at{" "}
          <span className="font-semibold">{formatSigned(biggestEdge.marketSpread)}</span> — a{" "}
          {biggestEdge.gap.toFixed(1)}-point gap.
        </p>
      )}

      {accuracy && <AccuracyStrip accuracy={accuracy} />}

      {gamesLoading && <p className="text-foreground/82">Loading…</p>}
      {gamesError && <p className="text-red-600 dark:text-red-400">Failed to load betting insights.</p>}
      {games && games.length === 0 && (
        <p className="text-foreground/72">No upcoming games with picks right now — check back closer to tip-off.</p>
      )}

      <div className="space-y-4">
        {games?.map((game) => (
          <GameCard key={game.espnId} game={game} />
        ))}
      </div>
    </div>
  );
}
