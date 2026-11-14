"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Segmented } from "@/components/templates/variants/shared";

/** One pick, whatever its kind: a side of the spread, the game total, or a
 * player prop. The betting page converts its data into these so the board can
 * treat every pick the same way. All numbers are in the pick's own units
 * (points of spread, points of total, or the stat itself). */
export interface BoardRow {
  id: string;
  kind: "spread" | "total" | "prop";
  gameId: string;
  matchup: string;
  date: string;
  status: "SCHEDULED" | "LIVE" | "FINAL";
  /** Player name, or the team and line for a spread, or "Game total". */
  label: string;
  /** "Spread", "Total", or the stat name. */
  market: string;
  /** House notation for the pick, e.g. "o10.5" or "-7.5". */
  pickText: string;
  odds: string;
  /** The market's number and ours, in the same units. */
  line: number;
  projected: number;
  /** The typical swing in that number (one standard deviation), if known. */
  stdev: number | null;
  /** Standard deviations our number clears the line by, at the line the pick
   * was made against. */
  edge: number | null;
  /** The same edge measured against the market's line now, when it has moved. */
  edgeNow: number | null;
  recommended: boolean;
  isBestBet: boolean;
  bestBetRank: number | null;
  correct: boolean | null;
  actual: string | null;
  /** Set when the market moved since the pick was made. */
  nowLine: string | null;
  ruledOut: boolean;
  dnp: boolean;
  playerId: number | null;
  statType: string | null;
  /** The player's last completed games for this stat, oldest first (props only). */
  recent: { value: number; date: string }[] | null;
}

export interface RecordTile {
  label: string;
  href: string;
  hitRate: number | null;
  graded: number;
  correct: number;
  units: number | null;
}

type Show = "best" | "recommended" | "all";
type Sort = "edge" | "time" | "name";

const MIN_EDGES = [
  { value: "0", label: "Any edge" },
  { value: "0.5", label: "0.5 or more" },
  { value: "1", label: "1.0 or more" },
  { value: "1.5", label: "1.5 or more" },
];

const STAT_SHORT: Record<string, string> = {
  POINTS: "PTS",
  REBOUNDS: "REB",
  ASSISTS: "AST",
  THREE_POINTERS_MADE: "3PM",
  STEALS: "STL",
  BLOCKS: "BLK",
  POINTS_ASSISTS: "P+A",
  POINTS_REBOUNDS: "P+R",
  REBOUNDS_ASSISTS: "R+A",
  POINTS_REBOUNDS_ASSISTS: "PRA",
  DOUBLE_DOUBLE: "DD",
  TRIPLE_DOUBLE: "TD",
};

const PAGE = 40;

function units(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(1)}u`;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The headline record: four numbers, each a link to its full breakdown. */
export function RecordTiles({ tiles }: { tiles: RecordTile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map((t) => {
        const pct = t.hitRate !== null ? Math.round(t.hitRate * 100) : null;
        const good = t.hitRate !== null && t.hitRate >= 0.524;
        return (
          <li key={t.label}>
            <Link
              href={t.href}
              className="flex h-full flex-col justify-between gap-2 rounded-lg bg-surface p-4 outline-none transition-shadow hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm font-medium text-foreground/65">{t.label}</span>
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className={`font-display text-4xl font-bold leading-none tabular-nums sm:text-5xl ${pct === null ? "" : good ? "text-win" : "text-foreground"}`}>
                  {pct === null ? "-" : `${pct}%`}
                </span>
                {t.units !== null && (
                  <span className={`font-mono text-sm font-semibold tabular-nums ${t.units >= 0 ? "text-win" : "text-loss"}`}>{units(t.units)}</span>
                )}
              </span>
              <span className="text-xs text-foreground/55">
                {t.correct} of {t.graded} graded
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Our number against the market's on one number line, with the typical swing
 * drawn as a band around ours. The market line is labeled above the track and
 * our projection below, so the labels never collide however close they sit. */
function Gauge({ row }: { row: BoardRow }) {
  const spread = row.stdev && row.stdev > 0 ? row.stdev : Math.max(Math.abs(row.projected - row.line) * 0.5, 1);
  const lo = Math.min(row.line, row.projected) - 1.75 * spread;
  const hi = Math.max(row.line, row.projected) + 1.75 * spread;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="px-2 pb-9 pt-7">
      <div className="relative h-2.5 rounded-full bg-border/60" role="img" aria-label={`Market line ${num(row.line)}, our projection ${num(row.projected)}`}>
        {row.stdev && row.stdev > 0 && (
          <span
            className="absolute inset-y-0 rounded-full bg-accent/25"
            style={{ left: pos(row.projected - row.stdev), width: `calc(${pos(row.projected + row.stdev)} - ${pos(row.projected - row.stdev)})` }}
          />
        )}
        <span className="absolute -top-1.5 h-[22px] w-[3px] -translate-x-1/2 rounded bg-foreground" style={{ left: pos(row.line) }} />
        <span className="absolute -top-[26px] -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ left: pos(row.line) }}>
          Market {num(row.line)}
        </span>
        <span className="absolute -top-0.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-accent ring-2 ring-surface-muted" style={{ left: pos(row.projected) }} />
        <span className="absolute top-5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-accent" style={{ left: pos(row.projected) }}>
          Ours {num(row.projected)}
        </span>
      </div>
    </div>
  );
}

/** The player's last ten games against this pick's line: a green box where the
 * pick would have won, red where it would have lost, grey on a push. Oldest on
 * the left, most recent on the right. */
function FormBoxes({ row }: { row: BoardRow }) {
  const games = row.recent ?? [];
  if (games.length === 0) return <span className="text-foreground/40">-</span>;
  const over = row.pickText.startsWith("o");
  const outcomes = games.map((g) => (g.value === row.line ? "push" : (over ? g.value > row.line : g.value < row.line) ? "hit" : "miss"));
  const hits = outcomes.filter((o) => o === "hit").length;
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={`${hits} of the last ${games.length} games ${over ? "over" : "under"} ${num(row.line)}`}>
      <span className="inline-flex gap-[3px]">
        {games.map((g, i) => (
          <span
            key={i}
            title={`${new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${g.value}`}
            className={`h-4 w-[7px] rounded-[2px] ${outcomes[i] === "hit" ? "bg-win" : outcomes[i] === "miss" ? "bg-loss/75" : "bg-foreground/25"}`}
          />
        ))}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground/60">
        {hits}/{games.length}
      </span>
    </span>
  );
}

function ResultCell({ row }: { row: BoardRow }) {
  if (row.correct !== null) {
    return (
      <span className={`inline-flex items-center gap-1 text-sm font-semibold ${row.correct ? "text-win" : "text-loss"}`}>
        {row.correct ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <X className="h-4 w-4" strokeWidth={2.5} />}
        {row.correct ? "Hit" : "Missed"}
      </span>
    );
  }
  if (row.dnp) return <span className="text-sm text-foreground/55">Did not play</span>;
  if (row.ruledOut) return <span className="text-sm font-semibold text-loss">Ruled out</span>;
  if (row.status === "LIVE") return <span className="text-sm font-semibold text-accent">Live</span>;
  return <span className="text-sm text-foreground/55">{new Date(row.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>;
}

/** How far our number is from the line, in the stat's own units. A spread is
 * "points of cushion"; a prop or total is how far over or under the line we
 * expect the number to land. */
function gap(row: BoardRow): { value: string; note: string } {
  const d = Math.abs(row.projected - row.line);
  if (row.kind === "spread") return { value: d.toFixed(1), note: "pt cushion" };
  return { value: d.toFixed(1), note: row.projected > row.line ? "over line" : "under line" };
}

/** The edge as a graded chip. The thresholds match how the rest of the app
 * talks about confidence: 1.0 and up is high-confidence, 0.75 is the floor for
 * recommending a pick at all. */
function EdgeChip({ row }: { row: BoardRow }) {
  if (row.edge === null) return <span className="text-foreground/40">-</span>;
  const tier = row.edge >= 1.5 ? "strong" : row.edge >= 1 ? "solid" : "lean";
  const cls =
    tier === "strong"
      ? "bg-accent text-accent-foreground"
      : tier === "solid"
        ? "bg-accent/15 text-accent"
        : "bg-surface-muted text-foreground/65";
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${cls}`} title={`${tier} edge: ${row.edge.toFixed(2)} standard deviations from the line`}>
      {row.edge.toFixed(1)}σ
      <span className="text-[11px] font-medium opacity-80">{tier}</span>
    </span>
  );
}

const GAME_COLS = "min-[1440px]:grid-cols-[2rem_minmax(0,2fr)_5.5rem_4.5rem_5rem_7.5rem_8.5rem_6rem_1.25rem]";
const PROP_COLS = "min-[1440px]:grid-cols-[2rem_minmax(0,1.5fr)_3.25rem_5rem_4rem_4rem_6.5rem_7.5rem_9.75rem_5.5rem_1rem]";

function Row({ row, rank, open, onToggle }: { row: BoardRow; rank: number; open: boolean; onToggle: () => void }) {
  const prop = row.kind === "prop";
  const g = gap(row);
  const time = new Date(row.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3.5 text-left outline-none hover:bg-surface-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent min-[1440px]:gap-x-3 min-[1440px]:px-4 ${prop ? PROP_COLS : GAME_COLS} ${open ? "bg-surface-muted/70" : ""}`}
      >
        <span className={`font-display text-xl font-bold leading-none tabular-nums ${rank <= 3 ? "text-accent" : "text-foreground/35"}`}>{rank}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{row.kind === "total" ? "Game total" : row.label}</span>
            {row.isBestBet && <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-none text-accent-foreground">Best bet {row.bestBetRank ?? ""}</span>}
          </span>
          <span className="block truncate text-xs text-foreground/55">
            {row.kind === "prop" ? row.matchup : `${row.market}, ${row.matchup}`}, {time}
          </span>
        </span>
        {prop && (
          <span className="hidden min-[1440px]:block">
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground/75" title={row.market}>
              {STAT_SHORT[row.statType ?? ""] ?? row.market}
            </span>
          </span>
        )}
        <span className="col-start-3 row-start-1 text-right font-display text-2xl font-bold leading-none tabular-nums min-[1440px]:col-auto min-[1440px]:row-auto min-[1440px]:text-left">{row.pickText}</span>
        <span className="hidden font-mono text-sm text-foreground/70 tabular-nums min-[1440px]:block">{row.odds}</span>
        <span className="hidden font-mono text-sm tabular-nums min-[1440px]:block">{num(row.projected)}</span>
        <span className="hidden min-[1440px]:block">
          <span className="font-mono text-sm font-semibold tabular-nums">{g.value}</span> <span className="text-xs text-foreground/55">{g.note}</span>
        </span>
        <span className="hidden min-[1440px]:block">
          <EdgeChip row={row} />
        </span>
        {prop && (
          <span className="hidden min-[1440px]:block">
            <FormBoxes row={row} />
          </span>
        )}
        <span className="hidden text-sm min-[1440px]:block">
          <ResultCell row={row} />
        </span>
        <ChevronDown className={`hidden h-4 w-4 text-foreground/40 transition-transform min-[1440px]:block ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />

        {/* Phone: the same facts on a second line instead of seven columns. */}
        <span className="col-start-2 col-end-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm min-[1440px]:hidden">
          {prop && <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground/75">{STAT_SHORT[row.statType ?? ""] ?? row.market}</span>}
          <span className="font-mono text-foreground/70">{row.odds}</span>
          <span className="text-foreground/65">
            <span className="font-mono font-semibold text-foreground">{g.value}</span> {g.note}
          </span>
          <EdgeChip row={row} />
          {prop && <FormBoxes row={row} />}
          <span className="ml-auto">
            <ResultCell row={row} />
          </span>
        </span>
      </button>
      {open && (
        <div className="bg-surface-muted/60 px-4 pb-4 pt-2 min-[1440px]:px-[4.5rem]">
          <Gauge row={row} />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="max-w-xl text-foreground/70">
              Our number is {num(row.projected)} against a market line of {num(row.line)}
              {row.edge !== null ? `, which is ${row.edge.toFixed(1)} standard deviations of edge` : ""}
              {row.stdev ? `. The typical swing is about ${row.stdev.toFixed(1)}, shown as the shaded band.` : "."}
              {row.nowLine
                ? ` The market has since moved to ${row.nowLine}${row.edgeNow !== null ? `, where the edge would be ${row.edgeNow.toFixed(1)}` : ""}; we are graded on the line we picked at.`
                : ""}
              {row.actual ? ` Actual: ${row.actual}.` : ""}
            </p>
            <div className="flex gap-4 font-semibold">
              {row.playerId !== null && row.statType && (
                <Link href={`/betting/research/${row.playerId}?stat=${row.statType}`} className="text-accent hover:underline">
                  Research this player
                </Link>
              )}
              <Link href={`/games/${row.gameId}`} className="text-accent hover:underline">
                Open the game
              </Link>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function HeaderRow({ prop }: { prop: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`hidden items-center gap-x-4 border-b border-border bg-surface-muted/60 px-4 py-2.5 text-sm font-semibold text-foreground/60 min-[1440px]:grid ${prop ? PROP_COLS : GAME_COLS}`}
    >
      <span>#</span>
      <span>{prop ? "Player" : "Pick"}</span>
      {prop && <span>Stat</span>}
      <span>Pick</span>
      <span>Odds</span>
      <span>Ours</span>
      <span>Gap</span>
      <span>Edge</span>
      {prop && <span>Last 10</span>}
      <span>Result</span>
      <span />
    </div>
  );
}

const selectCls = "rounded-md bg-surface px-2.5 py-1.5 text-sm outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-accent";

function Section({
  id,
  title,
  blurb,
  count,
  total,
  controls,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  count: number;
  total: number;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id={id} className="text-3xl">
            {title} <span className="ml-1 text-xl font-medium text-foreground/45">{count === total ? count : `${count} of ${total}`}</span>
          </h2>
          <p className="mt-1 text-sm text-foreground/60">{blurb}</p>
        </div>
        {controls}
      </div>
      {children}
    </section>
  );
}

/** The slate as two tables, one for game picks (spreads and totals) and one for
 * player props. The controls at the top narrow both; each table has its own
 * filters as well. Rows open to show how far our number sits from the market's. */
export function PickBoard({
  rows,
  lineMode,
  onLineMode,
}: {
  rows: BoardRow[];
  lineMode: "initial" | "current";
  onLineMode: (m: "initial" | "current") => void;
}) {
  const [show, setShow] = useState<Show>("recommended");
  const [game, setGame] = useState("all");
  const [minEdge, setMinEdge] = useState("0");
  const [sort, setSort] = useState<Sort>("edge");
  const [gameMarket, setGameMarket] = useState<"all" | "Spread" | "Total">("all");
  const [stat, setStat] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [propLimit, setPropLimit] = useState(PAGE);
  const [gameLimit, setGameLimit] = useState(PAGE);

  const gameRows = useMemo(() => rows.filter((r) => r.kind !== "prop"), [rows]);
  const propRows = useMemo(() => rows.filter((r) => r.kind === "prop"), [rows]);
  const counts = useMemo(
    () => ({ best: rows.filter((r) => r.isBestBet).length, recommended: rows.filter((r) => r.recommended).length, all: rows.length }),
    [rows],
  );
  const games = useMemo(() => Array.from(new Map(rows.map((r) => [r.gameId, r.matchup])).entries()), [rows]);
  const stats = useMemo(() => Array.from(new Map(propRows.map((r) => [r.statType ?? "", r.market])).entries()), [propRows]);

  function narrow(list: BoardRow[]): BoardRow[] {
    const min = parseFloat(minEdge);
    return list
      .filter((r) => (show === "best" ? r.isBestBet : show === "recommended" ? r.recommended : true))
      .filter((r) => game === "all" || r.gameId === game)
      .filter((r) => min === 0 || (r.edge ?? -1) >= min)
      .sort((a, b) => {
        if (show === "best" && sort === "edge" && a.bestBetRank !== b.bestBetRank) return (a.bestBetRank ?? 99) - (b.bestBetRank ?? 99);
        if (sort === "time") return a.date.localeCompare(b.date) || (b.edge ?? -1) - (a.edge ?? -1);
        if (sort === "name") return a.label.localeCompare(b.label);
        return (b.edge ?? -1) - (a.edge ?? -1);
      });
  }

  const gamesVisible = useMemo(
    () => narrow(gameRows).filter((r) => gameMarket === "all" || r.market === gameMarket),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameRows, show, game, minEdge, sort, gameMarket],
  );
  const propsVisible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return narrow(propRows)
      .filter((r) => stat === "all" || r.statType === stat)
      .filter((r) => !q || r.label.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propRows, show, game, minEdge, sort, stat, query]);

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Which picks to show"
            value={show}
            onChange={(v) => {
              setShow(v);
              setPropLimit(PAGE);
              setGameLimit(PAGE);
            }}
            options={[
              { value: "best", label: `Best bets (${counts.best})` },
              { value: "recommended", label: `Recommended (${counts.recommended})` },
              { value: "all", label: `Everything (${counts.all})` },
            ]}
          />
          {show === "best" && (
            <span className="flex items-center gap-2 text-sm text-foreground/65">
              Lines
              <Segmented
                label="Best bets line mode"
                value={lineMode}
                onChange={onLineMode}
                options={[
                  { value: "initial", label: "When picked" },
                  { value: "current", label: "Right now" },
                ]}
              />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-foreground/65">
            Game
            <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls}>
              <option value="all">All games</option>
              {games.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-foreground/65">
            Edge
            <select value={minEdge} onChange={(e) => setMinEdge(e.target.value)} className={selectCls}>
              {MIN_EDGES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-foreground/65">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls}>
              <option value="edge">Strongest edge</option>
              <option value="time">Start time</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </div>

      {show !== "best" && (
        <Section
          id="game-picks-h"
          title="Game picks"
          blurb="Which side of each spread, and which way on each total, our model likes."
          count={gamesVisible.length}
          total={gameRows.length}
          controls={
            <Segmented
              label="Game pick type"
              value={gameMarket}
              onChange={setGameMarket}
              options={[
                { value: "all", label: "Both" },
                { value: "Spread", label: "Spreads" },
                { value: "Total", label: "Totals" },
              ]}
            />
          }
        >
          <div className="overflow-hidden rounded-lg bg-surface">
            <HeaderRow prop={false} />
            {gamesVisible.length === 0 ? (
              <p className="p-6 text-foreground/70">
                {gameRows.length === 0 ? "No game picks yet. They appear once games have lines and projections." : "No game picks match these filters. Lower the edge, or switch to Everything."}
              </p>
            ) : (
              <ol>
                {gamesVisible.slice(0, gameLimit).map((r, i) => (
                  <Row key={r.id} row={r} rank={i + 1} open={openId === r.id} onToggle={() => toggle(r.id)} />
                ))}
              </ol>
            )}
          </div>
          {gamesVisible.length > gameLimit && (
            <button type="button" onClick={() => setGameLimit((n) => n + PAGE)} className="rounded-md px-3 py-2 text-sm font-semibold text-accent outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent">
              Show {Math.min(PAGE, gamesVisible.length - gameLimit)} more
            </button>
          )}
        </Section>
      )}

      <Section
        id="props-h"
        title="Player props"
        blurb={show === "best" ? "Today's best bets, all player props, in the order we ranked them." : "Over and under calls on individual stat lines."}
        count={propsVisible.length}
        total={propRows.length}
        controls={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="relative">
              <span className="sr-only">Search players</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" strokeWidth={1.75} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPropLimit(PAGE);
                }}
                placeholder="Find a player"
                className={`${selectCls} w-44 pl-8`}
              />
            </label>
            <label className="flex items-center gap-2 text-foreground/65">
              Stat
              <select
                value={stat}
                onChange={(e) => {
                  setStat(e.target.value);
                  setPropLimit(PAGE);
                }}
                className={selectCls}
              >
                <option value="all">All stats</option>
                {stats.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        <div className="overflow-hidden rounded-lg bg-surface">
          <HeaderRow prop />
          {propsVisible.length === 0 ? (
            <p className="p-6 text-foreground/70">
              {propRows.length === 0 ? "No player props yet for this day." : "No player props match these filters. Clear the search, lower the edge, or switch to Everything."}
            </p>
          ) : (
            <ol>
              {propsVisible.slice(0, propLimit).map((r, i) => (
                <Row key={r.id} row={r} rank={i + 1} open={openId === r.id} onToggle={() => toggle(r.id)} />
              ))}
            </ol>
          )}
        </div>
        {propsVisible.length > propLimit && (
          <button type="button" onClick={() => setPropLimit((n) => n + PAGE)} className="rounded-md px-3 py-2 text-sm font-semibold text-accent outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent">
            Show {Math.min(PAGE, propsVisible.length - propLimit)} more of {propsVisible.length - propLimit} remaining
          </button>
        )}
      </Section>

      <p className="text-sm text-foreground/55">
        Edge is how far our number sits from the market line, measured in the typical game-to-game swing for that stat. A strong edge is 1.5 or more, solid is 1.0 or more, and lean is anything under that.
      </p>
    </div>
  );
}
