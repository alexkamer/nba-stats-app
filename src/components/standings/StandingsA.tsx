"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Segmented } from "@/components/ui/shared";
import { parseStreak } from "@/components/home/home-data";
import { L10Dots, type L10Game } from "@/components/ui/shared";

export interface StandingsColumnA {
  label: string;
  /** A thin rule before this column, grouping related columns. */
  divider?: boolean;
}

export interface StandingsRowA {
  id: number;
  rank: ReactNode;
  team: { id: number; displayName: string; abbreviation: string; logoUrl?: string | null };
  /** W, L, PCT and GB. */
  lead: [ReactNode, ReactNode, ReactNode, ReactNode];
  /** One cell for each extra column, in order. */
  cells: ReactNode[];
  /** Playoff line drawn under this row (conference view only). */
  rule: "after-six" | "after-ten" | null;
  /** Inside the top six, which advance directly (conference view only). */
  advances: boolean;
}

/** Streak as a colored W or L with its length. Accepts either feed's format:
 * "5" or "-3" (signed) or already "W5". */
export function StreakA({ streak }: { streak: string | null }) {
  if (!streak) return null;
  const s = parseStreak(streak);
  if (s.dir === "none") return null;
  return <span className={`font-semibold tabular-nums ${s.dir === "win" ? "text-win" : "text-loss"}`}>{s.label}</span>;
}

/** Last ten as blocks plus the record. */
export function LastTenA({ record, games }: { record: string | null; games?: L10Game[] }) {
  if (!record) return null;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <L10Dots record={record} games={games} />
      <span className="w-8 text-right text-foreground/60">{record}</span>
    </span>
  );
}

/** Points differential, green when positive and red when negative. */
export function DiffA({ ppg, opp }: { ppg: number | null; opp: number | null }) {
  if (ppg === null || opp === null) return null;
  const d = ppg - opp;
  return <span className={`font-semibold tabular-nums ${d > 0 ? "text-win" : d < 0 ? "text-loss" : ""}`}>{`${d >= 0 ? "+" : ""}${d.toFixed(1)}`}</span>;
}

const DIVIDER = "border-l border-border/70 pl-4";

// Fixed column widths (in rem) so every table in a view lines up with the
// others, instead of each table sizing its own columns to its own content.
const LEAD_WIDTHS = [3.75, 2.75, 4.75, 3.75];
const TEAM_WIDTH = 17;
function columnWidth(label: string): number {
  if (label === "L10") return 11;
  if (label === "STRK") return 5;
  // Long headers wrap onto two lines, so width follows half the label.
  return Math.min(7.5, Math.max(5, Math.ceil(label.length / 2) * 0.62 + 2.5));
}

/** One group (a conference, a division, the league, or a Cup group) as a flat
 * table: a header, one row per team with the team column held in place while the
 * stats scroll sideways on narrow screens. */
export function StandingsGroupA({ title, columns, rows, lead = ["W", "L", "PCT", "GB"] }: { title: string; columns: StandingsColumnA[]; rows: StandingsRowA[]; lead?: string[] }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg bg-surface">
      <h2 className="px-4 py-3 text-2xl">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed whitespace-nowrap text-[15px]" style={{ minWidth: `${TEAM_WIDTH + LEAD_WIDTHS.reduce((a, b) => a + b, 0) + columns.reduce((a, c) => a + columnWidth(c.label), 0) + 0.75}rem` }}>
          <colgroup>
            <col className="w-[9.5rem] sm:w-[17rem]" />
            {LEAD_WIDTHS.map((w, i) => (
              <col key={i} style={{ width: `${w}rem` }} />
            ))}
            {columns.map((c) => (
              <col key={c.label} style={{ width: `${columnWidth(c.label)}rem` }} />
            ))}
            <col style={{ width: "0.75rem" }} />
          </colgroup>
          <thead>
            <tr className="border-y border-border bg-surface-muted/60 text-sm text-foreground/60">
              <th className="sticky left-0 z-10 bg-surface-muted py-2 pl-4 pr-3 text-left font-semibold">Team</th>
              {lead.map((l, i) => (
                <th key={l} className={`px-2 py-2 text-right font-semibold ${i === 0 ? DIVIDER : ""}`}>
                  {l}
                </th>
              ))}
              {columns.map((c) => (
                <th key={c.label} className={`whitespace-normal px-2 py-2 text-right font-semibold leading-tight ${c.divider ? DIVIDER : ""}`}>
                  {c.label}
                </th>
              ))}
              <th className="w-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`hover:bg-surface-muted/50 ${
                  r.rule === "after-six" ? "border-b-2 border-dotted border-foreground/35" : r.rule === "after-ten" ? "border-b-2 border-foreground/55" : "border-b border-border/60"
                }`}
              >
                <td className="sticky left-0 z-10 bg-surface py-2.5 pl-4 pr-3">
                  <Link href={`/teams/${r.team.id}`} className="flex items-center gap-3 outline-none hover:text-accent focus-visible:underline">
                    <span className={`w-5 shrink-0 text-right font-display text-lg font-bold leading-none tabular-nums ${r.advances ? "text-accent" : "text-foreground/40"}`}>{r.rank}</span>
                    {r.team.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.team.logoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />
                    )}
                    <span className="min-w-0 truncate font-semibold">
                      <span className="sm:hidden">{r.team.abbreviation}</span>
                      <span className="hidden sm:inline">{r.team.displayName}</span>
                    </span>
                  </Link>
                </td>
                {r.lead.map((v, i) => (
                  <td key={i} className={`px-2 py-2.5 text-right tabular-nums ${i === 0 ? `${DIVIDER} font-semibold` : ""}`}>
                    {v}
                  </td>
                ))}
                {r.cells.map((v, i) => (
                  <td key={i} className={`px-2 py-2.5 text-right tabular-nums text-foreground/85 ${columns[i]?.divider ? DIVIDER : ""}`}>
                    {v}
                  </td>
                ))}
                <td className="w-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Title and the controls in one place: which table, how it is grouped, and
 * which season. */
export function StandingsHeaderA<M extends string, V extends string>({
  seasonLabel,
  modes,
  mode,
  onMode,
  views,
  view,
  onView,
  seasons,
  season,
  onSeason,
}: {
  seasonLabel: string | null;
  modes: { value: M; label: string }[];
  mode: M;
  onMode: (m: M) => void;
  /** Hidden for the NBA Cup, which has its own groups. */
  views: { value: V; label: string }[] | null;
  view: V;
  onView: (v: V) => void;
  seasons: { value: number; label: string }[];
  season: number | null;
  onSeason: (y: number) => void;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-5xl leading-none">
          Standings
          {seasonLabel && <span className="ml-3 text-2xl font-medium text-foreground/45">{seasonLabel}</span>}
        </h1>
        {seasons.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-foreground/65">
            Season
            <select
              value={season ?? ""}
              onChange={(e) => onSeason(Number(e.target.value))}
              className="rounded-md bg-surface px-2.5 py-1.5 text-sm outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-accent"
            >
              {seasons.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Table" value={mode} onChange={onMode} options={modes} />
        {views && <Segmented label="Group by" value={view} onChange={onView} options={views} />}
      </div>
    </header>
  );
}
