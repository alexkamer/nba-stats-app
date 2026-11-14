"use client";

import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";
import { parseStreak, type Conference, type LeaderCategory } from "@/components/home/home-data";
import { L10Dots } from "@/components/ui/shared";

/** Five leader categories side by side: the leader's headshot and figure
 * large, then the next four underneath. Scrolls sideways on phones. */
export function LeadersStrip({ categories }: { categories?: LeaderCategory[] }) {
  return (
    <div className="-mx-5 flex scroll-px-5 snap-x overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-px sm:overflow-visible sm:bg-border sm:px-0 lg:grid-cols-5">
      {categories?.map((c) => {
        const [first, ...rest] = c.leaders;
        return (
          <div key={c.key} className="w-64 shrink-0 snap-start border-r border-border bg-surface p-4 sm:w-auto sm:border-r-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xl">{c.label}</h3>
              <Link href={`/leaders?stat=${c.key}`} className="text-sm font-semibold text-accent outline-none hover:underline focus-visible:underline">
                See all
              </Link>
            </div>
            {first && (
              <Link href={`/players/${first.id}`} className="mt-3 flex items-center gap-3 outline-none hover:text-accent focus-visible:underline">
                <CircularBadge src={first.headshotUrl} alt="" size="lg" />
                <div className="min-w-0">
                  <p className="font-display text-5xl font-bold leading-none tabular-nums">{first.displayValue}</p>
                  <p className="mt-1 truncate text-sm font-semibold">{first.displayName}</p>
                </div>
              </Link>
            )}
            <ol className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {rest.slice(0, 4).map((l, i) => (
                <li key={l.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className="mr-2 text-foreground/45 tabular-nums">{i + 2}</span>
                    <Link href={`/players/${l.id}`} className="outline-none hover:text-accent focus-visible:underline">
                      {l.displayName}
                    </Link>
                  </span>
                  <span className="font-semibold tabular-nums">{l.displayValue}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/** One conference as a full table: record, win percentage, games behind, last-ten
 * blocks and streak, with heavy rules at the direct-qualification (sixth) and
 * play-in (tenth) cut lines. */
export function StandingsTable({ conf }: { conf: Conference }) {
  return (
    <div className="bg-surface">
      <h3 className="border-b border-border px-4 py-2.5 text-2xl">{conf.conferenceName}</h3>
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-b border-border text-sm text-foreground/60">
            <th className="w-9 py-2 pl-4 text-left font-semibold">#</th>
            <th className="py-2 text-left font-semibold">Team</th>
            <th className="px-2 py-2 text-right font-semibold">W</th>
            <th className="px-2 py-2 text-right font-semibold">L</th>
            <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Pct</th>
            <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">GB</th>
            <th className="hidden px-2 py-2 text-left font-semibold md:table-cell">Last 10</th>
            <th className="py-2 pl-2 pr-4 text-right font-semibold">Streak</th>
          </tr>
        </thead>
        <tbody>
          {conf.standings.slice(0, 15).map((r, i) => {
            const st = parseStreak(r.streak);
            return (
              <tr key={r.team.id} className={`border-b border-border/60 last:border-b-0 ${i === 5 || i === 9 ? "border-b-2 border-b-foreground/30" : ""}`}>
                <td className="py-2 pl-4 font-semibold text-foreground/50 tabular-nums">{r.conferenceRank ?? i + 1}</td>
                <td className="py-2">
                  <Link href={`/teams/${r.team.id}`} className="flex items-center gap-2 font-semibold outline-none hover:text-accent focus-visible:underline">
                    <CircularBadge src={r.team.logoUrl} alt="" size="sm" />
                    {r.team.name}
                  </Link>
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.wins}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{r.winPct?.toFixed(3).replace(/^0/, "")}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{r.gamesBehind === 0 ? "-" : r.gamesBehind}</td>
                <td className="hidden px-2 py-2 md:table-cell">
                  <L10Dots record={r.lastTen} games={r.lastTenGames} />
                </td>
                <td className={`py-2 pl-2 pr-4 text-right font-bold tabular-nums ${st.dir === "win" ? "text-win" : st.dir === "loss" ? "text-loss" : ""}`}>{st.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

