"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";

export interface KotcEntry {
  playerId: number;
  playerName: string;
  headshotUrl: string | null;
  rank: number;
  projected: number;
  hit: boolean | null;
}

const href = (e: KotcEntry) => `/betting/research/${e.playerId}?stat=POINTS_REBOUNDS_ASSISTS`;

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

/** A round headshot at a fixed size, with initials when there is no photo. */
function Face({ entry, size, ring = true }: { entry: KotcEntry; size: number; ring?: boolean }) {
  const box = { width: size, height: size };
  return entry.headshotUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
    <img src={entry.headshotUrl} alt="" style={box} className={`shrink-0 rounded-full bg-surface-muted object-cover object-top ${ring ? "ring-4 ring-surface" : ""}`} />
  ) : (
    <span style={box} className={`grid shrink-0 place-items-center rounded-full bg-surface-muted font-semibold text-foreground/60 ${ring ? "ring-4 ring-surface" : ""}`}>
      {initials(entry.playerName)}
    </span>
  );
}

function Verdict({ hit }: { hit: boolean | null }) {
  if (hit === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${hit ? "text-win" : "text-loss"}`}>
      {hit ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <X className="h-4 w-4" strokeWidth={2.5} />}
      {hit ? "Called it" : "Missed"}
    </span>
  );
}

const STEP = { 1: "h-28", 2: "h-20", 3: "h-14" } as const;

function PodiumPlace({ entry, place }: { entry: KotcEntry; place: 1 | 2 | 3 }) {
  const first = place === 1;
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center">
      <Link href={href(entry)} className="group flex w-full min-w-0 flex-col items-center gap-2 rounded-lg px-1 pb-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Face entry={entry} size={first ? 104 : 76} />
        <span className={`w-full font-semibold leading-tight group-hover:text-accent ${first ? "line-clamp-2 text-lg sm:text-xl" : "truncate text-sm sm:text-base"}`}>{entry.playerName}</span>
        <span className={`font-display font-bold leading-none tabular-nums ${first ? "text-5xl sm:text-6xl" : "text-3xl sm:text-4xl"}`}>{entry.projected.toFixed(1)}</span>
        <span className="text-xs text-foreground/55">projected PRA</span>
        {first && <Verdict hit={entry.hit} />}
      </Link>
      <div
        className={`grid w-full place-items-center rounded-t-lg font-display text-4xl font-bold ${STEP[place]} ${first ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"}`}
        aria-hidden="true"
      >
        {place}
      </div>
    </li>
  );
}

/** King of the Court: a stepped podium for the top three, then everyone else as
 * a ranked list. Each bar is that player's projected total as a share of the
 * leader's, so the list shows at a glance how close the race is. */
export function KotcSpotlight({ entries }: { entries: KotcEntry[] }) {
  if (entries.length === 0) return null;
  const [first, second, third, ...rest] = entries;
  const leader = first.projected;
  return (
    <div className="overflow-hidden rounded-xl bg-gradient-to-b from-accent/10 via-surface to-surface">
      <ol className="mx-auto flex max-w-3xl items-end gap-2 px-3 pt-8 sm:gap-5 sm:px-8" aria-label="Top three projected">
        {second && <PodiumPlace entry={second} place={2} />}
        <PodiumPlace entry={first} place={1} />
        {third && <PodiumPlace entry={third} place={3} />}
      </ol>
      {rest.length > 0 && (
        <ol className="border-t border-border/70 bg-surface px-3 py-2 sm:px-6">
          {rest.map((e) => (
            <li key={e.playerId} className="border-b border-border/50 last:border-b-0">
              <Link href={href(e)} className="grid grid-cols-[1.5rem_2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-2.5 outline-none hover:text-accent focus-visible:underline sm:grid-cols-[1.5rem_2.25rem_12rem_minmax(0,1fr)_3.5rem]">
                <span className="font-mono text-sm text-foreground/45">{e.rank}</span>
                <Face entry={e} size={36} ring={false} />
                <span className="truncate font-medium">{e.playerName}</span>
                <span className="col-span-3 col-start-1 flex items-center gap-3 sm:col-span-2 sm:col-start-auto">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.max(8, (e.projected / leader) * 100)}%` }} />
                  </span>
                  <span className="w-12 text-right font-mono text-sm tabular-nums">{e.projected.toFixed(1)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
