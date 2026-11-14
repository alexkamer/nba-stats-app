"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { TabPager } from "@/components/TabPager";
import { LiveDot } from "@/components/ui/shared";

export type GameMode = "pregame" | "live" | "final";

export interface HeaderTeam {
  abbreviation: string;
  displayName: string;
  logoUrl: string | null;
  accent: string;
  score: number | null;
  record: string | null;
  /** e.g. "3-2 Away". */
  split: string | null;
}

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

/** The raw `?tab=` value and a setter that always writes it. The existing hook
 * drops `?tab=` for its default tab, which here would send "Box score" back to
 * the first tab; and which tabs exist depends on the game's state, which is
 * only known once the game has loaded, so the page resolves the final tab. */
export function useTabParamRaw<T extends string>(): [string | null, (tab: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const set = (tab: T) => {
    const params = new URLSearchParams(search.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  return [search.get("tab"), set];
}

function TeamBlock({ team, align }: { team: HeaderTeam; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-4 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"}`}>
      {team.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
        <img src={team.logoUrl} alt="" className="h-12 w-12 shrink-0 object-contain sm:h-[4.5rem] sm:w-[4.5rem]" />
      )}
      <div className="min-w-0 text-center sm:text-inherit">
        <p className="line-clamp-2 font-display text-xl font-semibold leading-tight sm:text-3xl">
          <span className="sm:hidden">{team.abbreviation}</span>
          <span className="hidden sm:inline">{team.displayName}</span>
        </p>
        <p className="mt-1 truncate text-xs text-foreground/55 sm:text-sm">
          {team.record ?? ""}
          {team.split ? `, ${team.split}` : ""}
        </p>
      </div>
    </div>
  );
}

/** One header for all three game states. What it puts in the middle is the
 * difference: a tip-off time before the game, a live score with a pulsing
 * clock during it, and a final score with the winner emphasized after. The tab
 * set also differs by state (passed in). */
export function GameHeaderA<T extends string>({
  away,
  home,
  mode,
  statusDetail,
  onBreak = false,
  tipoff,
  context,
  linescores,
  periodLabel,
  tabs,
  activeTab,
  onTabChange,
}: {
  away: HeaderTeam;
  home: HeaderTeam;
  mode: GameMode;
  statusDetail: string | null;
  /** Live only: the game is paused (halftime, end of a period), so the clock is not running. */
  onBreak?: boolean;
  /** Pregame only: "7:00 PM" and the date line. */
  tipoff: { time: string; date: string } | null;
  /** Pregame only: e.g. "NY -7.5, total 219.5". */
  context: string | null;
  linescores: { away: number[]; home: number[] } | null;
  periodLabel: (i: number) => string;
  tabs: TabOption<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}) {
  const awayWon = mode === "final" && away.score !== null && home.score !== null && away.score > home.score;
  const homeWon = mode === "final" && away.score !== null && home.score !== null && home.score > away.score;
  const periods = linescores ? Math.max(linescores.away.length, linescores.home.length) : 0;

  return (
    <header className="overflow-hidden rounded-lg bg-surface">
      <div className="flex h-[3px] w-full" aria-hidden="true">
        <span className="flex-1" style={{ background: away.accent }} />
        <span className="flex-1" style={{ background: home.accent }} />
      </div>
      <div className="px-4 pb-6 pt-7 sm:px-10 sm:pb-7 sm:pt-9">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
          <TeamBlock team={away} align="left" />
          <div className="flex min-w-[8.5rem] flex-col items-center gap-2 text-center sm:min-w-[13rem]">
            {mode === "pregame" ? (
              <>
                <p className="font-display text-4xl font-semibold leading-none tabular-nums sm:text-5xl">{tipoff?.time ?? "TBD"}</p>
                {tipoff && <p className="text-sm text-foreground/60">{tipoff.date}</p>}
                {context && <p className="text-sm font-medium text-foreground/80">{context}</p>}
              </>
            ) : (
              <>
                <p className="flex items-baseline justify-center gap-3 font-display font-semibold leading-none tabular-nums sm:gap-5">
                  <span className={`text-5xl sm:text-6xl ${homeWon ? "text-foreground/40" : ""}`}>{away.score ?? "-"}</span>
                  <span className="text-xl text-foreground/25 sm:text-2xl">-</span>
                  <span className={`text-5xl sm:text-6xl ${awayWon ? "text-foreground/40" : ""}`}>{home.score ?? "-"}</span>
                </p>
                {mode === "live" ? (
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-loss">
                    {onBreak ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-loss/60" /> : <LiveDot />}
                    {statusDetail ?? "Live"}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-foreground/60">{statusDetail ?? "Final"}</p>
                )}
              </>
            )}
            {mode === "pregame" && <p className="text-xs font-medium text-foreground/45">Not started</p>}
          </div>
          <TeamBlock team={home} align="right" />
        </div>

        {mode !== "pregame" && periods > 0 && linescores && (
          <div className="mt-6 flex justify-center overflow-x-auto border-t border-border/70 pt-4">
            <table className="text-sm tabular-nums text-foreground/70">
              <thead>
                <tr className="text-xs text-foreground/50">
                  <th className="px-3 text-left font-medium" />
                  {Array.from({ length: periods }, (_, i) => (
                    <th key={i} className="min-w-9 px-2 text-center font-medium">
                      {periodLabel(i)}
                    </th>
                  ))}
                  <th className="min-w-11 px-2 text-center font-semibold text-foreground/70">T</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { t: away, ls: linescores.away },
                  { t: home, ls: linescores.home },
                ].map(({ t, ls }) => (
                  <tr key={t.abbreviation}>
                    <th scope="row" className="px-3 py-0.5 text-left font-semibold text-foreground/80">
                      {t.abbreviation}
                    </th>
                    {Array.from({ length: periods }, (_, i) => (
                      <td key={i} className="px-2 py-0.5 text-center">
                        {ls[i] ?? ""}
                      </td>
                    ))}
                    <td className="px-2 py-0.5 text-center font-semibold text-foreground">{t.score ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <TabPager tabs={tabs} activeTab={activeTab} onChange={onTabChange} accentColor={home.accent} />
    </header>
  );
}

/** Live games only: how current the page is, and where the game stands right
 * now. Win probability is the home team's chance (0 to 1), shown as a bar
 * split between the two teams' own colors. */
export function LiveStrip({
  away,
  home,
  homeWinProbability,
  lastPlay,
  updatedAt,
}: {
  away: { abbreviation: string; accent: string };
  home: { abbreviation: string; accent: string };
  homeWinProbability: number | null;
  lastPlay: { text: string; when: string } | null;
  updatedAt: number;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = now === null ? null : Math.max(0, Math.round((now - updatedAt) / 1000));
  const homePct = homeWinProbability === null ? null : Math.round(homeWinProbability * 100);
  return (
    <section aria-label="Live status" className="space-y-4 rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <LiveDot />
          <span className="font-semibold text-loss">Live</span>
          <span className="text-foreground/50">Updates every 15 seconds</span>
        </span>
        <span className="text-foreground/50" aria-live="off">
          {seconds === null ? "" : `Updated ${seconds}s ago`}
        </span>
      </div>
      {homePct !== null && (
        <div>
          <div className="mb-2 flex items-baseline justify-between text-sm font-medium">
            <span>
              {away.abbreviation} <span className="ml-1 font-display text-xl font-semibold tabular-nums">{100 - homePct}%</span>
            </span>
            <span className="text-xs text-foreground/50">Chance to win</span>
            <span>
              <span className="mr-1 font-display text-xl font-semibold tabular-nums">{homePct}%</span> {home.abbreviation}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${home.abbreviation} ${homePct} percent to win`}>
            <span className="transition-[width] duration-700" style={{ width: `${100 - homePct}%`, background: away.accent }} />
            <span className="flex-1" style={{ background: home.accent }} />
          </div>
        </div>
      )}
      {lastPlay && (
        <p className="border-t border-border/70 pt-3 text-sm text-foreground/80">
          <span className="mr-3 font-mono text-xs text-foreground/50">{lastPlay.when}</span>
          {lastPlay.text}
        </p>
      )}
    </section>
  );
}

export interface FeedPlay {
  key: string | number;
  when: string;
  text: string;
  score: string | null;
  scoring: boolean;
}

/** The most recent plays, newest first. */
export function LatestPlays({ plays, onMore }: { plays: FeedPlay[]; onMore: () => void }) {
  if (plays.length === 0) return null;
  return (
    <section aria-labelledby="latest-h" className="rounded-lg bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="latest-h" className="text-lg">
          Latest plays
        </h2>
        <button type="button" onClick={onMore} className="text-sm font-semibold text-accent hover:underline">
          Full play-by-play
        </button>
      </div>
      <ol>
        {plays.map((p) => (
          <li key={p.key} className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 border-b border-border/60 py-2 last:border-b-0">
            <span className="font-mono text-xs text-foreground/55">{p.when}</span>
            <span className={p.scoring ? "font-semibold" : "text-foreground/80"}>{p.text}</span>
            <span className="font-mono text-sm tabular-nums text-foreground/70">{p.score ?? ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
