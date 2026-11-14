"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { CircularBadge } from "@/components/CircularBadge";
import { isBreak, isUnderway } from "@/lib/game-status";
import { LiveDot } from "@/components/templates/variants/shared";

interface SideLite {
  abbreviation: string;
  displayName: string;
  score: number | null;
  logoUrl: string | null;
  color: string | null;
  moneyline: number | null;
  lineScore: string[];
  overallRecord: string | null;
  splitRecord: string | null;
}

export interface ScoreboardGameLite {
  espnId: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: SideLite;
  away: SideLite;
}

function ml(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 ? `+${value}` : `${value}`;
}

function toKey(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function fromKey(v: string): Date {
  return new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00`);
}

/** A week centered on the selected day, so moving a few days in either
 * direction is one tap instead of repeated arrow clicks. */
function DayStrip({ date, setDate, shiftDay }: { date: string; setDate: (v: string) => void; shiftDay: (n: number) => void }) {
  const [todayKey] = useState(() => toKey(new Date()));
  const center = fromKey(date);
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(center);
    d.setDate(center.getDate() + i - 3);
    return { key: toKey(d), weekday: d.toLocaleDateString(undefined, { weekday: "short" }), day: d.getDate(), month: d.toLocaleDateString(undefined, { month: "short" }) };
  });
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => shiftDay(-7)}
        aria-label="Back one week"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-foreground/60 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <div role="group" aria-label="Pick a day" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
        {days.map((d) => {
          const on = d.key === date;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDate(d.key)}
              aria-pressed={on}
              aria-label={`${d.weekday} ${d.month} ${d.day}${d.key === todayKey ? ", today" : ""}`}
              className={`flex min-w-[3.75rem] flex-1 flex-col items-center rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                on ? "bg-accent text-accent-foreground" : "bg-surface text-foreground/75 hover:bg-surface-muted"
              }`}
            >
              <span className="text-xs font-medium">{d.key === todayKey ? "Today" : d.weekday}</span>
              <span className="font-display text-2xl font-bold leading-tight tabular-nums">{d.day}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => shiftDay(7)}
        aria-label="Forward one week"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-foreground/60 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function Card({ game, accent }: { game: ScoreboardGameLite; accent: string }) {
  const live = isUnderway(game.statusName);
  const onBreak = isBreak(game.statusName);
  const final = game.statusName === "STATUS_FINAL";
  const scheduled = game.statusName === "STATUS_SCHEDULED";
  const scored = game.away.score != null && game.home.score != null;
  const awayWon = final && scored && game.away.score! > game.home.score!;
  const homeWon = final && scored && game.home.score! > game.away.score!;
  const periods = scheduled ? 0 : Math.max(4, game.away.lineScore.length, game.home.lineScore.length);
  const label = (i: number) => (i < 4 ? `${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ""}`);
  const base = `/games/${game.espnId}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg bg-surface" style={{ borderTop: `3px solid ${accent}` }}>
      <Link href={base} className="flex flex-1 flex-col gap-3 p-4 outline-none hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${live ? "text-loss" : "text-foreground/60"}`}>
          {live && (onBreak ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-loss/60" /> : <LiveDot />)}
          {live && !onBreak ? `Q${game.period} ${game.clock ?? ""}` : game.statusDetail}
        </span>
        {[
          { t: game.away, won: awayWon, split: "Away" },
          { t: game.home, won: homeWon, split: "Home" },
        ].map(({ t, won, split }) => {
          const line = ml(t.moneyline);
          const muted = final && !won;
          return (
            <div key={t.abbreviation} className="flex items-center gap-3">
              <CircularBadge src={t.logoUrl} alt="" size="md" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[17px] leading-tight ${muted ? "font-medium text-foreground/55" : "font-semibold"}`}>{t.displayName}</p>
                <p className="truncate text-xs text-foreground/55">
                  {t.overallRecord ?? ""}
                  {t.splitRecord ? `, ${t.splitRecord} ${split.toLowerCase()}` : ""}
                  {scheduled && line ? `, ${line}` : ""}
                </p>
              </div>
              {!scheduled && <span className={`font-display text-4xl font-bold leading-none tabular-nums ${muted ? "text-foreground/40" : ""}`}>{t.score ?? "-"}</span>}
            </div>
          );
        })}
        {periods > 0 && (
          <table className="mt-1 w-full text-xs tabular-nums text-foreground/60">
            <thead>
              <tr>
                <th className="w-12 py-0.5 text-left font-medium">
                  <span className="sr-only">Team</span>
                </th>
                {Array.from({ length: periods }).map((_, i) => (
                  <th key={i} className="py-0.5 text-right font-medium">
                    {label(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[game.away, game.home].map((t) => (
                <tr key={t.abbreviation}>
                  <th scope="row" className="py-0.5 text-left font-semibold text-foreground/80">
                    {t.abbreviation}
                  </th>
                  {Array.from({ length: periods }).map((_, i) => (
                    <td key={i} className="py-0.5 text-right">
                      {t.lineScore[i] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Link>
      <nav aria-label="More about this game" className="flex divide-x divide-border border-t border-border text-sm font-semibold">
        {[
          { label: "Gamecast", tab: "gamecast" },
          { label: "Box score", tab: "boxscore" },
          { label: "Play-by-play", tab: "playbyplay" },
        ].map((l) => (
          <Link
            key={l.tab}
            href={`${base}?tab=${l.tab}`}
            className="flex-1 px-2 py-2.5 text-center text-foreground/70 outline-none hover:bg-surface-muted hover:text-accent focus-visible:bg-surface-muted"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </article>
  );
}

/** Scoreboard for layout A: a day strip for quick date changes, then a grid
 * of game cards with scores at a glance, a compact line score and direct
 * links to the game's tabs. Same data and date handling as the existing page. */
export function ScoreboardA({
  date,
  setDate,
  shiftDay,
  games,
  loading,
  error,
  accentFor,
}: {
  date: string;
  setDate: (v: string) => void;
  shiftDay: (n: number) => void;
  games: ScoreboardGameLite[] | undefined;
  loading: boolean;
  error: boolean;
  accentFor: (g: ScoreboardGameLite) => string;
}) {
  const live = games?.filter((g) => isUnderway(g.statusName)).length ?? 0;
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-5xl leading-none">Scoreboard</h1>
          <p className="mt-2 text-foreground/65">
            {fromKey(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {games ? `, ${games.length} ${games.length === 1 ? "game" : "games"}${live ? `, ${live} live` : ""}` : ""}
          </p>
        </div>
        <div className="xl:w-[34rem]">
          <DayStrip date={date} setDate={setDate} shiftDay={shiftDay} />
        </div>
      </header>

      {error && (
        <p className="flex items-center gap-2 text-loss">
          <AlertCircle className="h-4 w-4" /> Couldn&apos;t load the scoreboard. Try another day or refresh the page.
        </p>
      )}
      {games?.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-surface p-5 text-foreground/70">
          <CalendarX className="h-5 w-5 shrink-0" /> No games on this day. Pick another day above.
        </p>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))]">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => <div key={i} aria-hidden="true" className="h-56 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />)}
        {games?.map((g) => <Card key={g.espnId} game={g} accent={accentFor(g)} />)}
      </div>
    </div>
  );
}
