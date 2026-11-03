"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { CircularBadge } from "@/components/CircularBadge";
import { getTeamAccent } from "@/lib/team-accent";

interface TeamSummary {
  id: number;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface TeamCoverRecord {
  id: number;
  team: TeamSummary;
  atsWins: number;
  atsLosses: number;
  atsPushes: number;
  atsHomeWins: number;
  atsHomeLosses: number;
  atsHomePushes: number;
  atsAwayWins: number;
  atsAwayLosses: number;
  atsAwayPushes: number;
  atsCurrentStreak: number;
  ouWins: number;
  ouLosses: number;
  ouPushes: number;
  ouHomeWins: number;
  ouHomeLosses: number;
  ouHomePushes: number;
  ouAwayWins: number;
  ouAwayLosses: number;
  ouAwayPushes: number;
  ouCurrentStreak: number;
  favWins: number;
  favLosses: number;
  dogWins: number;
  dogLosses: number;
  favAtsWins: number;
  favAtsLosses: number;
  favAtsPushes: number;
  dogAtsWins: number;
  dogAtsLosses: number;
  dogAtsPushes: number;
}

interface PlayerSummary {
  id: number;
  espnId: string;
  displayName: string;
  headshotUrl: string | null;
}

interface DailyStatLeaderEntry {
  playerId: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
  player: PlayerSummary & { currentTeam: { abbreviation: string; color: string | null; logoUrl: string | null } | null };
}

interface DailyStatLeaderDay {
  id: number;
  date: string;
  entries: DailyStatLeaderEntry[];
}

interface CrownTallyEntry {
  player: PlayerSummary;
  days: number;
}

interface Birthday extends PlayerSummary {
  birthDate: string;
}

interface OnThisDayPerformance {
  player: PlayerSummary;
  points: number;
  rebounds: number;
  assists: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
  gameEspnId: string;
  date: string;
  year: number;
  team: TeamSummary | null;
  opponent: TeamSummary | null;
  teamScore: number;
  opponentScore: number;
  isHome: boolean;
}

interface AccuracyBucket {
  graded: number;
  correct: number;
  hitRate: number | null;
}

interface PlayerStreakEntry {
  player: PlayerSummary & { currentTeam: { id: number; abbreviation: string; logoUrl: string | null; color: string | null } | null };
  statType: "POINTS" | "REBOUNDS" | "ASSISTS";
  floor: number;
  streak: number;
  hitRate: number | null;
}

const STAT_LABELS: Record<string, string> = {
  POINTS: "Points",
  REBOUNDS: "Rebounds",
  ASSISTS: "Assists",
  THREE_POINTERS_MADE: "3-Pointers Made",
  STEALS: "Steals",
  BLOCKS: "Blocks",
  POINTS_ASSISTS: "Points + Assists",
  POINTS_REBOUNDS: "Points + Rebounds",
  REBOUNDS_ASSISTS: "Rebounds + Assists",
  POINTS_REBOUNDS_ASSISTS: "Points + Rebounds + Assists",
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

function record(wins: number, losses: number, pushes: number): string {
  return pushes > 0 ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

function streakLabel(streak: number, winLabel: string, lossLabel: string): string {
  if (streak === 0) return "—";
  return streak > 0 ? `${winLabel} ${streak}` : `${lossLabel} ${Math.abs(streak)}`;
}

/** ATS win percentage, used to rank the team cover-records table — a team
 * with no graded games yet sorts last rather than tying with a 0-win team
 * that's actually played (both would otherwise read as 0%). */
function atsWinPct(r: TeamCoverRecord): number {
  const decided = r.atsWins + r.atsLosses;
  return decided === 0 ? -1 : r.atsWins / decided;
}

function TeamCoverRecordsSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["betting", "history", "team-cover-records"],
    queryFn: () => fetchJson<{ records: TeamCoverRecord[] }>("/api/betting/history/team-cover-records"),
  });

  if (isLoading) return <p className="text-foreground/72">Loading team records…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load team cover records.</p>;
  if (!data || data.records.length === 0) {
    return <p className="text-foreground/72">No team cover records yet this season — check back once games have been graded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-foreground/72">
            <th className="pb-2 font-normal">Team</th>
            <th className="pb-2 text-right font-normal">ATS</th>
            <th className="pb-2 text-right font-normal">Home</th>
            <th className="pb-2 text-right font-normal">Away</th>
            <th className="pb-2 text-right font-normal">Streak</th>
            <th className="pb-2 text-right font-normal">O/U</th>
            <th className="pb-2 text-right font-normal">Home</th>
            <th className="pb-2 text-right font-normal">Away</th>
            <th className="pb-2 text-right font-normal">Streak</th>
            <th className="pb-2 text-right font-normal">As Favorite</th>
            <th className="pb-2 text-right font-normal">Fav ATS</th>
            <th className="pb-2 text-right font-normal">As Underdog</th>
            <th className="pb-2 text-right font-normal">Dog ATS</th>
          </tr>
        </thead>
        <tbody>
          {[...data.records].sort((a, b) => atsWinPct(b) - atsWinPct(a)).map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="py-1.5">
                <Link href={`/teams/${r.team.id}`} className="inline-flex items-center gap-1.5 font-semibold hover:text-accent">
                  <CircularBadge src={r.team.logoUrl} alt="" size="sm" />
                  {r.team.abbreviation}
                </Link>
              </td>
              <td className="py-1.5 text-right tabular-nums">{record(r.atsWins, r.atsLosses, r.atsPushes)}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {record(r.atsHomeWins, r.atsHomeLosses, r.atsHomePushes)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {record(r.atsAwayWins, r.atsAwayLosses, r.atsAwayPushes)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {streakLabel(r.atsCurrentStreak, "W", "L")}
              </td>
              <td className="py-1.5 text-right tabular-nums">{record(r.ouWins, r.ouLosses, r.ouPushes)}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {record(r.ouHomeWins, r.ouHomeLosses, r.ouHomePushes)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {record(r.ouAwayWins, r.ouAwayLosses, r.ouAwayPushes)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {streakLabel(r.ouCurrentStreak, "Over", "Under")}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">{record(r.favWins, r.favLosses, 0)}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {record(r.favAtsWins, r.favAtsLosses, r.favAtsPushes)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">{record(r.dogWins, r.dogLosses, 0)}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground/72">
                {record(r.dogAtsWins, r.dogAtsLosses, r.dogAtsPushes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Local (not UTC) YYYY-MM-DD, same convention used elsewhere on the
 * betting pages, so a leader's date lines up with the calendar cell it's
 * rendered under regardless of viewer timezone. */
function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole-month difference between two first-of-month dates (positive when
 * `to` is later), used to clamp how far back the King of the Court month
 * nav can step. */
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const NAME_SUFFIXES = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii", "iv"]);

// ESPN's own box-score-leader shorthand ("Anthony Edwards" -> "A. Edwards"),
// same convention as the game and team pages' own `shortName`/`toShortName`
// — keeps a generational suffix attached to the surname rather than
// mistaking it for one (e.g. "Jaren Jackson Jr." -> "J. Jackson Jr.").
function shortName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return displayName;
  const hasSuffix = parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase());
  const surname = hasSuffix ? parts.slice(-2).join(" ") : parts[parts.length - 1];
  return `${parts[0][0]}. ${surname}`;
}

/** Prev/next-month stepper, matching the visual language of the betting
 * page's own day-nav. `atLatest`/`atEarliest` disable the side that would
 * step outside the season's available data (no future months, no months
 * before the first one with a recorded leader). */
function MonthNav({
  label,
  atEarliest,
  atLatest,
  onShift,
  onJumpToLatest,
}: {
  label: string;
  atEarliest: boolean;
  atLatest: boolean;
  onShift: (months: number) => void;
  onJumpToLatest: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => onShift(-1)}
        disabled={atEarliest}
        className="rounded-md border border-border px-2.5 py-1 hover:border-foreground/50 disabled:opacity-40 disabled:hover:border-border"
      >
        ← Prev
      </button>
      <span className="font-semibold min-w-[9rem] text-center">{label}</span>
      <button
        type="button"
        onClick={() => onShift(1)}
        disabled={atLatest}
        className="rounded-md border border-border px-2.5 py-1 hover:border-foreground/50 disabled:opacity-40 disabled:hover:border-border"
      >
        Next →
      </button>
      {!atLatest && (
        <button type="button" onClick={onJumpToLatest} className="text-accent hover:underline">
          Jump to this month
        </button>
      )}
    </div>
  );
}

// A day's PRA total mapped to 0..1 — floors out below an ordinary game
// (nothing below MIN_PRA reads as "dim"; anything at/above MAX_PRA is
// already an exceptional night and maxes the intensity out) rather than
// scaling across the full possible range, where a 25-PRA day and a 60-PRA
// day would otherwise look nearly identical.
const MIN_PRA = 25;
const MAX_PRA = 65;

function praIntensity(pra: number): number {
  return Math.min(Math.max((pra - MIN_PRA) / (MAX_PRA - MIN_PRA), 0), 1);
}

/** Two-digit hex alpha scaled by intensity, within a floor/ceiling that
 * keeps the tint visible without ever washing out the content on top. */
function intensityAlphaHex(intensity: number, minAlpha: number, maxAlpha: number): string {
  const alpha = Math.round(minAlpha + intensity * (maxAlpha - minAlpha));
  return alpha.toString(16).padStart(2, "0");
}

/** A day cell's background — a diagonal tint from its leader's team color
 * when there's one leader, or a two-tone split (same convention as the
 * game page's away/home gradient strip) when the day is tied between two
 * teams, scaled in intensity by how big that day's PRA total was. Falls
 * back to no tint when team color data isn't available, or there are more
 * than two ties. */
function dayCellBackground(entries: DailyStatLeaderEntry[], theme: "light" | "dark"): string | undefined {
  const intensity = praIntensity(entries[0]?.pointsReboundsAssists ?? 0);
  const accents = entries.map((e) => getTeamAccent(e.player.currentTeam?.color, theme).accent);
  if (accents.length === 1) {
    return `linear-gradient(145deg, ${accents[0]}${intensityAlphaHex(intensity, 0x14, 0x4a)}, transparent 70%)`;
  }
  if (accents.length === 2) {
    const alpha = intensityAlphaHex(intensity, 0x10, 0x38);
    return `linear-gradient(90deg, ${accents[0]}${alpha} 0%, transparent 42%, transparent 58%, ${accents[1]}${alpha} 100%)`;
  }
  return undefined;
}

/** Large, faint team-logo watermark centered behind a cell's content —
 * one logo for a solo leader, both teams' logos side by side for a tie.
 * Reuses the headshot's own team (current team, same simplification as
 * the tint above) rather than adding a second visual language for "whose
 * team is this" on top of the color accent. */
function TeamLogoWatermark({ logoUrls }: { logoUrls: (string | null | undefined)[] }) {
  const urls = [...new Set(logoUrls.filter((u): u is string => Boolean(u)))];
  if (urls.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1">
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" aria-hidden="true" className={`opacity-[0.14] ${urls.length > 1 ? "h-11 w-11" : "h-16 w-16"}`} />
      ))}
    </div>
  );
}

function MonthGrid({ month, daysByKey }: { month: Date; daysByKey: Map<string, DailyStatLeaderDay> }) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;

  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
    ...Array(totalCells - leadingBlanks - daysInMonth).fill(null),
  ];

  const todayKey = dayKey(new Date());

  // The month's single highest-PRA day gets a crown — one thing for the
  // eye to land on, rather than every day reading as equally notable.
  let bestDayKey: string | null = null;
  let bestPra = -1;
  for (const date of cells) {
    if (!date) continue;
    const pra = daysByKey.get(dayKey(date))?.entries[0]?.pointsReboundsAssists ?? -1;
    if (pra > bestPra) {
      bestPra = pra;
      bestDayKey = dayKey(date);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-surface to-surface-muted/60 p-4 shadow-sm">
      <div className="grid grid-cols-7 gap-1.5 border-b border-border/60 pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="min-h-[6.5rem] rounded-lg" />;
          const key = dayKey(date);
          const day = daysByKey.get(key);
          const isToday = key === todayKey;
          const soloLeader = day?.entries.length === 1 ? day.entries[0] : null;
          const soloAccent = soloLeader ? getTeamAccent(soloLeader.player.currentTeam?.color, theme).accent : null;
          const isBestDay = Boolean(day) && key === bestDayKey;
          const content = (
            <>
              {day && <TeamLogoWatermark logoUrls={day.entries.map((e) => e.player.currentTeam?.logoUrl)} />}
              <div className="relative z-10">
                <p className="flex items-center justify-between">
                  <span className={`text-xs ${isToday ? "font-bold text-accent" : "text-foreground/50"}`}>{date.getDate()}</span>
                  {isBestDay && <span title="This month's best performance">👑</span>}
                </p>
                {soloLeader ? (
                  <div className="mt-1 flex flex-col items-center gap-1 text-center">
                    <span className="rounded-full" style={soloAccent ? { boxShadow: `0 0 0 2px ${soloAccent}` } : undefined}>
                      <CircularBadge src={soloLeader.player.headshotUrl} alt="" size="lg" />
                    </span>
                    <span className="w-full truncate text-xs font-medium leading-tight text-foreground/82">
                      {shortName(soloLeader.player.displayName)}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-foreground/60">
                      {soloLeader.pointsReboundsAssists} PRA
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {day?.entries.map((entry) => (
                      <div key={entry.playerId} className="flex items-center gap-1.5 overflow-hidden">
                        <CircularBadge src={entry.player.headshotUrl} alt="" size="sm" />
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-xs leading-tight text-foreground/82">{shortName(entry.player.displayName)}</span>
                          <span className="block text-[10px] font-semibold tabular-nums text-foreground/60">
                            {entry.pointsReboundsAssists} PRA
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          );
          const title = day ? day.entries.map((e) => `${e.player.displayName}: ${e.pointsReboundsAssists} PRA`).join(", ") : undefined;
          return day ? (
            <Link
              key={key}
              href={`/betting/history/king-of-the-court/${key}`}
              title={title}
              style={{ background: dayCellBackground(day.entries, theme) }}
              className={`relative min-h-[6.5rem] overflow-hidden rounded-lg border p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                isToday ? "border-accent" : "border-border/60 hover:border-accent/60"
              }`}
            >
              {content}
            </Link>
          ) : (
            <div
              key={key}
              className={`min-h-[6.5rem] overflow-hidden rounded-lg border border-dashed p-2 text-left ${
                isToday ? "border-accent" : "border-border/30"
              }`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KingOfTheCourtSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["betting", "history", "daily-leaders"],
    queryFn: () => fetchJson<{ days: DailyStatLeaderDay[]; crownTally: CrownTallyEntry[] }>("/api/betting/history/daily-leaders"),
  });

  // "This month" is only known once this effect runs — calling `new Date()`
  // directly during render trips Next's blocking-prerender-current-time
  // check (same reasoning as the betting page's own day-nav).
  const [latestMonth, setLatestMonth] = useState<Date | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  useEffect(() => {
    const now = new Date();
    setLatestMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  if (isLoading || !latestMonth) return <p className="text-foreground/72">Loading King of the Court…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load daily leaders.</p>;
  if (!data || data.days.length === 0) {
    return <p className="text-foreground/72">No daily leaders yet this season — check back once a full day&apos;s games have finished.</p>;
  }

  const daysByKey = new Map(data.days.map((d) => [dayKey(new Date(d.date)), d]));
  const earliestMonth = data.days
    .map((d) => {
      const dt = new Date(d.date);
      return new Date(dt.getFullYear(), dt.getMonth(), 1);
    })
    .reduce((min, m) => (m < min ? m : min));

  const selectedMonth = new Date(latestMonth.getFullYear(), latestMonth.getMonth() + monthOffset, 1);
  const atEarliest = selectedMonth <= earliestMonth;
  const atLatest = monthOffset >= 0;
  const minOffset = -monthsBetween(earliestMonth, latestMonth);

  return (
    <div className="space-y-6">
      {data.crownTally.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground/72">Season crown tally</p>
          <div className="flex flex-wrap gap-2">
            {data.crownTally.slice(0, 10).map(({ player, days }) => (
              <span
                key={player.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs"
              >
                <CircularBadge src={player.headshotUrl} alt="" size="xs" />
                {player.displayName} <span className="font-semibold tabular-nums">× {days}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <MonthNav
        label={selectedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        atEarliest={atEarliest}
        atLatest={atLatest}
        onShift={(months) => setMonthOffset((offset) => Math.min(Math.max(offset + months, minOffset), 0))}
        onJumpToLatest={() => setMonthOffset(0)}
      />
      <p className="text-xs text-foreground/60">Click a day to see that day&apos;s full leaderboard.</p>
      <MonthGrid month={selectedMonth} daysByKey={daysByKey} />
    </div>
  );
}

function BirthdaysSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["betting", "history", "birthdays"],
    queryFn: () => fetchJson<{ players: Birthday[] }>("/api/betting/history/birthdays"),
  });

  if (isLoading) return <p className="text-foreground/72">Loading birthdays…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load today&apos;s birthdays.</p>;
  if (!data || data.players.length === 0) {
    return <p className="text-foreground/72">No active players have a birthday today.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {data.players.map((player) => (
        <span key={player.id} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <CircularBadge src={player.headshotUrl} alt="" size="sm" />
          {player.displayName}
        </span>
      ))}
    </div>
  );
}

function PropHitRateByStatTypeSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["betting", "accuracy"],
    queryFn: () => fetchJson<{ propsByStatType: Record<string, AccuracyBucket> }>("/api/betting/accuracy"),
  });

  if (isLoading) return <p className="text-foreground/72">Loading prop hit rates…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load prop hit rates.</p>;

  const entries = data ? Object.entries(data.propsByStatType) : [];
  if (entries.length === 0) {
    return <p className="text-foreground/72">No graded player-prop picks yet this season.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries
        .sort((a, b) => (b[1].hitRate ?? 0) - (a[1].hitRate ?? 0))
        .map(([statType, bucket]) => (
          <div key={statType} className="min-w-[8rem] rounded-lg bg-surface-muted px-3 py-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              {STAT_LABELS[statType] ?? statType}
            </p>
            <p className="font-display text-2xl font-extrabold leading-none tracking-tight text-foreground">
              {bucket.hitRate !== null ? `${(bucket.hitRate * 100).toFixed(0)}%` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-foreground/60 tabular-nums">
              {bucket.correct}/{bucket.graded}
            </p>
          </div>
        ))}
    </div>
  );
}

function playerStreaksQueryOptions() {
  return {
    queryKey: ["betting", "history", "player-streaks"],
    queryFn: () => fetchJson<{ date: string | null; entries: PlayerStreakEntry[] }>("/api/betting/history/player-streaks"),
  };
}

function PlayerStreaksSection() {
  const { data, isLoading, error } = useQuery(playerStreaksQueryOptions());

  if (isLoading) return <p className="text-foreground/72">Loading player streaks…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load player streaks.</p>;
  if (!data || data.entries.length === 0) {
    return <p className="text-foreground/72">No notable Over streaks right now — check back once more player props are posted.</p>;
  }

  const dateLabel = data.date ? new Date(data.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  return (
    <div className="space-y-3">
      {dateLabel && <p className="text-xs text-foreground/60">For Over props on {dateLabel}</p>}
      <div className="flex flex-wrap gap-3">
        {data.entries.map((entry) => (
          <div key={`${entry.player.id}-${entry.statType}`} className="w-56 shrink-0 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <CircularBadge src={entry.player.headshotUrl} alt="" size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{entry.player.displayName}</p>
                <p className="text-xs text-foreground/60">
                  {entry.player.currentTeam?.abbreviation} · {STAT_LABELS[entry.statType]} {entry.floor}+
                </p>
              </div>
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">
              {entry.streak > 0 ? `${entry.streak} straight` : "Hot L10"}
            </p>
            {entry.hitRate !== null && (
              <p className="text-xs text-foreground/60 tabular-nums">{(entry.hitRate * 100).toFixed(0)}% over last 10</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function onThisDayQueryOptions() {
  return {
    queryKey: ["betting", "history", "on-this-day"],
    queryFn: () => fetchJson<{ monthDay: string; performances: OnThisDayPerformance[] }>("/api/betting/history/on-this-day"),
  };
}

function OnThisDaySection() {
  const { data, isLoading, error } = useQuery(onThisDayQueryOptions());

  if (isLoading) return <p className="text-foreground/72">Loading on-this-day performances…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Failed to load on-this-day performances.</p>;
  if (!data || data.performances.length === 0) {
    return <p className="text-foreground/72">No historical performances recorded for this calendar date yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {data.performances.map((perf) => (
        <Link
          key={`${perf.player.id}-${perf.year}`}
          href={`/games/${perf.gameEspnId}`}
          className="w-56 shrink-0 rounded-lg border border-border bg-surface p-3 hover:border-accent"
        >
          <div className="flex items-center gap-2">
            <CircularBadge src={perf.player.headshotUrl} alt="" size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{perf.player.displayName}</p>
              <p className="text-xs text-foreground/60">{perf.year}</p>
            </div>
            {perf.hadTripleDouble && <span title="Triple-double">💪</span>}
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">{perf.pointsReboundsAssists} PRA</p>
          <p className="text-xs text-foreground/60 tabular-nums">
            {perf.points} PTS · {perf.rebounds} REB · {perf.assists} AST
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-foreground/72">
            <CircularBadge src={perf.team?.logoUrl} alt="" size="xs" />
            {perf.team?.abbreviation} {perf.teamScore} {perf.isHome ? "vs" : "@"} {perf.opponentScore} {perf.opponent?.abbreviation}
            <CircularBadge src={perf.opponent?.logoUrl} alt="" size="xs" />
          </p>
        </Link>
      ))}
    </div>
  );
}

interface TodayHighlight {
  icon: string;
  text: string;
  href?: string;
}

// How long a current streak has to be before it's worth calling out — a
// 1-game streak is just "the last game," not a trend.
const NOTABLE_STREAK_LENGTH = 3;

/** Summary strip pulling the single most noteworthy item out of each
 * section's already-fetched data (same query keys as the sections below,
 * so this adds no extra network requests) — meant to make the page read
 * as "what happened" rather than only static season-to-date tables. */
function TodayStrip() {
  const { data: teamData } = useQuery({
    queryKey: ["betting", "history", "team-cover-records"],
    queryFn: () => fetchJson<{ records: TeamCoverRecord[] }>("/api/betting/history/team-cover-records"),
  });
  const { data: leaderData } = useQuery({
    queryKey: ["betting", "history", "daily-leaders"],
    queryFn: () => fetchJson<{ days: DailyStatLeaderDay[]; crownTally: CrownTallyEntry[] }>("/api/betting/history/daily-leaders"),
  });
  const { data: birthdayData } = useQuery({
    queryKey: ["betting", "history", "birthdays"],
    queryFn: () => fetchJson<{ players: Birthday[] }>("/api/betting/history/birthdays"),
  });
  const { data: onThisDayData } = useQuery(onThisDayQueryOptions());

  const highlights: TodayHighlight[] = [];

  const latestDay = leaderData?.days[leaderData.days.length - 1];
  if (latestDay && latestDay.entries.length > 0) {
    const names = latestDay.entries.map((e) => shortName(e.player.displayName)).join(" & ");
    const dateLabel = new Date(latestDay.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    highlights.push({
      icon: "👑",
      text: `${names} led the court ${dateLabel} with ${latestDay.entries[0].pointsReboundsAssists} PRA`,
      href: `/betting/history/king-of-the-court/${dayKey(new Date(latestDay.date))}`,
    });

    const tripleDoubles = latestDay.entries.filter((e) => e.hadTripleDouble);
    if (tripleDoubles.length > 0) {
      highlights.push({
        icon: "💪",
        text: `${tripleDoubles.map((e) => shortName(e.player.displayName)).join(" & ")} recorded a triple-double ${dateLabel}`,
      });
    }
  }

  let hottest: { team: TeamSummary; kind: "ATS" | "O/U"; streak: number } | null = null;
  for (const r of teamData?.records ?? []) {
    if (Math.abs(r.atsCurrentStreak) >= NOTABLE_STREAK_LENGTH && (!hottest || Math.abs(r.atsCurrentStreak) > Math.abs(hottest.streak))) {
      hottest = { team: r.team, kind: "ATS", streak: r.atsCurrentStreak };
    }
    if (Math.abs(r.ouCurrentStreak) >= NOTABLE_STREAK_LENGTH && (!hottest || Math.abs(r.ouCurrentStreak) > Math.abs(hottest.streak))) {
      hottest = { team: r.team, kind: "O/U", streak: r.ouCurrentStreak };
    }
  }
  if (hottest) {
    const verb =
      hottest.kind === "ATS"
        ? hottest.streak > 0 ? "covered" : "failed to cover"
        : hottest.streak > 0 ? "gone over" : "gone under";
    highlights.push({ icon: "🔥", text: `${hottest.team.abbreviation} has ${verb} ${Math.abs(hottest.streak)} straight (${hottest.kind})` });
  }

  if (birthdayData && birthdayData.players.length > 0) {
    highlights.push({ icon: "🎂", text: `Happy birthday ${birthdayData.players.map((p) => p.displayName).join(", ")}!` });
  }

  const topOnThisDay = onThisDayData?.performances[0];
  if (topOnThisDay) {
    highlights.push({
      icon: "📅",
      text: `On this day in ${topOnThisDay.year}, ${shortName(topOnThisDay.player.displayName)} put up ${topOnThisDay.pointsReboundsAssists} PRA`,
      href: `/games/${topOnThisDay.gameEspnId}`,
    });
  }

  if (highlights.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {highlights.map((h) => {
        const chipClass =
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground/82" +
          (h.href ? " hover:border-accent hover:text-foreground" : "");
        return h.href ? (
          <Link key={h.text} href={h.href} className={chipClass}>
            <span>{h.icon}</span> {h.text}
          </Link>
        ) : (
          <span key={h.text} className={chipClass}>
            <span>{h.icon}</span> {h.text}
          </span>
        );
      })}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function CoverStoryPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Cover Story</h1>
        <p className="text-foreground/72 text-sm mt-1">
          This season&apos;s betting history and daily highlights — team cover records, King of the Court, today&apos;s birthdays,
          and how our prop picks have graded out by stat type.
        </p>
      </div>

      <TodayStrip />

      <SectionCard title="Team cover records">
        <TeamCoverRecordsSection />
      </SectionCard>

      <SectionCard title="King of the Court">
        <KingOfTheCourtSection />
      </SectionCard>

      <SectionCard title="Today's birthdays">
        <BirthdaysSection />
      </SectionCard>

      <SectionCard title="Prop hit rate by stat type">
        <PropHitRateByStatTypeSection />
      </SectionCard>

      <SectionCard title="Player streaks">
        <PlayerStreaksSection />
      </SectionCard>

      <SectionCard title="On this day">
        <OnThisDaySection />
      </SectionCard>
    </div>
  );
}
