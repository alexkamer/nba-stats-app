"use client";

import Link from "next/link";
import { TabPager } from "@/components/TabPager";
import { LiveDot } from "@/components/templates/variants/shared";

export interface PlayerTile {
  label: string;
  value: string;
  /** A short note under the figure, for example "3rd in the league". */
  note?: string;
}

interface PlayerTabOption<T extends string> {
  value: T;
  label: string;
}

export interface NextGameLite {
  espnId: string;
  date: string;
  status: "SCHEDULED" | "LIVE";
  broadcast: string | null;
  isHome: boolean;
  opponent: string;
}

/** Identity header for layout A: who the player is on the left, this season's
 * headline numbers (with league rank) on the right, then a single line about
 * the next game, which reads differently when that game is already live. */
export function PlayerHeaderA<T extends string>({
  name,
  headshotUrl,
  accent,
  team,
  jersey,
  position,
  active,
  facts,
  seasonLabel,
  tiles,
  next,
  tabs,
  activeTab,
  onTabChange,
}: {
  name: string;
  headshotUrl: string | null;
  accent: string;
  team: { id: number; displayName: string; logoUrl: string | null } | null;
  jersey: string | null;
  position: string | null;
  active: boolean;
  facts: { label: string; value: string }[];
  seasonLabel: string | null;
  tiles: PlayerTile[];
  next: NextGameLite | null;
  tabs: PlayerTabOption<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.join(" ");
  const when = next ? new Date(next.date) : null;
  return (
    <header className="overflow-hidden rounded-lg bg-surface">
      <div className="h-[3px] w-full" style={{ background: accent }} aria-hidden="true" />
      <div className="grid gap-6 px-4 py-6 sm:px-8 sm:py-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-10">
        <div className="flex items-center gap-5 sm:gap-7">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-36 sm:w-36" style={{ background: `${accent}1f` }}>
            {headshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
              <img src={headshotUrl} alt={name} className="h-full w-full object-contain object-bottom" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display leading-none">
              <span className="block text-lg font-medium text-foreground/60 sm:text-2xl">{first}</span>
              <span className="block text-4xl font-semibold sm:text-6xl">{last}</span>
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/75">
              {team ? (
                <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 font-medium text-foreground outline-none hover:text-accent focus-visible:underline">
                  {team.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.logoUrl} alt="" className="h-5 w-5" />
                  )}
                  {team.displayName}
                </Link>
              ) : (
                <span>Free agent</span>
              )}
              {jersey && <span className="text-foreground/50">#{jersey}</span>}
              {position && <span className="text-foreground/50">{position}</span>}
              <span className="inline-flex items-center gap-1.5 text-foreground/55">
                <span className={`h-2 w-2 rounded-full ${active ? "bg-win" : "bg-foreground/35"}`} aria-hidden="true" />
                {active ? "Active" : "Inactive"}
              </span>
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-8">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs text-foreground/50">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {tiles.length > 0 && (
          <div>
            {seasonLabel && <p className="mb-2 text-sm font-medium text-foreground/60">{seasonLabel} regular season</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="min-w-[7.5rem] rounded-lg bg-surface-muted p-3.5">
                  <p className="text-sm text-foreground/60">{t.label}</p>
                  <p className="mt-1 font-display text-4xl font-semibold leading-none tabular-nums">{t.value}</p>
                  {t.note && <p className="mt-2 text-xs text-foreground/55">{t.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {next && when && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm sm:px-8">
          <p className="flex flex-wrap items-center gap-x-2 text-foreground/75">
            {next.status === "LIVE" ? (
              <span className="inline-flex items-center gap-2 font-semibold text-loss">
                <LiveDot />
                Playing now
              </span>
            ) : (
              <span className="font-semibold text-foreground">Next game</span>
            )}
            <span>
              {next.isHome ? "vs" : "at"} {next.opponent}
            </span>
            {next.status !== "LIVE" && (
              <span className="text-foreground/55">
                {when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })},{" "}
                {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                {next.broadcast ? `, ${next.broadcast}` : ""}
              </span>
            )}
          </p>
          <Link href={`/games/${next.espnId}`} className="font-semibold text-accent hover:underline">
            {next.status === "LIVE" ? "Follow the game" : "Game preview"}
          </Link>
        </div>
      )}
      <TabPager tabs={tabs} activeTab={activeTab} onChange={onTabChange} accentColor={accent} />
    </header>
  );
}

/** Season line as flat tiles: no outlines, one number each. */
export function SeasonTiles({ title, tiles }: { title: string; tiles: PlayerTile[] }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-xl">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-surface p-3.5">
            <p className="text-sm text-foreground/60">{t.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold leading-none tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface FormGame {
  key: string | number;
  points: number;
  label: string;
  date: string;
  result: "W" | "L" | null;
}

/** Scoring across the last ten games, oldest on the left. The dashed line is
 * the average over those games, so a quick look says whether the most recent
 * games are above or below his recent norm. */
export function FormBars({ games, accent }: { games: FormGame[]; accent: string }) {
  if (games.length === 0) return null;
  const max = Math.max(...games.map((g) => g.points), 1);
  const avg = games.reduce((a, g) => a + g.points, 0) / games.length;
  return (
    <section aria-labelledby="form-h" className="rounded-lg bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="form-h" className="text-xl">
          Scoring, last {games.length} games
        </h2>
        <p className="text-sm text-foreground/60">
          Averaging <span className="font-mono font-semibold text-foreground">{avg.toFixed(1)}</span> points
        </p>
      </div>
      <div className="pt-6">
        <div className="relative h-32" style={{ maxWidth: `${games.length * 6}rem` }} role="img" aria-label={`Points in the last ${games.length} games, averaging ${avg.toFixed(1)}`}>
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/40" style={{ bottom: `${(avg / max) * 100}%` }} aria-hidden="true" />
          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-3">
            {games.map((g) => (
              <div
                key={g.key}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                title={`${new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${g.label}: ${g.points} points`}
              >
                <span
                  className="relative w-full max-w-10 rounded-t-[3px]"
                  style={{ height: `${Math.max(3, (g.points / max) * 100)}%`, background: accent, opacity: g.points >= avg ? 1 : 0.45 }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-xs tabular-nums text-foreground/70">{g.points}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 sm:gap-3" style={{ maxWidth: `${games.length * 6}rem` }}>
          {games.map((g) => (
            <div key={g.key} className="min-w-0 flex-1 text-center">
              <p className="truncate text-[11px] leading-tight text-foreground/60">{g.label}</p>
              {g.result && <p className={`text-[11px] font-bold ${g.result === "W" ? "text-win" : "text-loss"}`}>{g.result}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
