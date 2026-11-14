"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CircularBadge } from "@/components/CircularBadge";
import { parseStreak } from "@/components/templates/home-data";
import { L10Dots } from "@/components/templates/variants/shared";

/* The team page's data shapes are private to its page file, so these are the
 * minimal structural types this variant reads. The page passes its own values. */

interface TeamLite {
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
  division: { name: string; conference: { name: string } } | null;
  venue: { name: string; city: string | null; state: string | null } | null;
}

interface StandingLite {
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  conferenceRank: number | null;
  divisionRank: number | null;
  gamesBehind: number | null;
  streak: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
  lastTen: string | null;
}

interface GameTeamLite {
  name: string;
  displayName: string;
  abbreviation: string;
  logoUrl?: string | null;
}

export interface ScheduleGameLite {
  id: number;
  espnId: string;
  date: string;
  status: string;
  homeTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: GameTeamLite;
  awayTeam: GameTeamLite;
}

export interface NewsLite {
  id: number;
  headline: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
}

export interface DivisionRowLite {
  id: number;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  team: { id: number; displayName: string; abbreviation: string; location: string; logoUrl?: string | null };
}

function ordinal(n: number | null): string {
  if (n === null) return "";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}

function Tile({ label, children, foot }: { label: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-between rounded-lg bg-surface-muted p-3.5">
      <p className="text-sm font-medium text-foreground/60">{label}</p>
      <div className="mt-1">{children}</div>
      {foot && <div className="mt-2 text-xs text-foreground/60">{foot}</div>}
    </div>
  );
}

const num = "font-display text-4xl font-bold leading-none tabular-nums";

/** Entity header for layout A: identity on the left, the season's headline
 * numbers as a row of tiles on the right. Sits inside the page's own
 * `FullBleed` + `TabPager`, so tabs behave exactly as before. */
export function TeamHeaderA({
  team,
  standing,
  stats,
}: {
  team: TeamLite;
  standing: StandingLite | null;
  stats: { pointsPerGame: number | null; oppPointsPerGame: number | null } | null;
}) {
  const streak = parseStreak(standing?.streak ?? null);
  const margin = stats?.pointsPerGame != null && stats.oppPointsPerGame != null ? stats.pointsPerGame - stats.oppPointsPerGame : null;
  const place = [team.venue?.name, [team.venue?.city, team.venue?.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 lg:px-10 2xl:max-w-[1500px]">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-5">
          {team.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logoUrl} alt="" className="h-20 w-20 shrink-0 sm:h-24 sm:w-24" />
          )}
          <div className="min-w-0">
            <h1 className="text-4xl leading-none sm:text-6xl">{team.displayName}</h1>
            <p className="mt-2 text-foreground/70">
              {team.division ? `${team.division.name} Division, ${team.division.conference.name}` : ""}
            </p>
            {place && <p className="text-sm text-foreground/55">{place}</p>}
          </div>
        </div>

        {standing && (
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Record" foot={`${ordinal(standing.divisionRank)} in division`}>
              <p className={num}>
                {standing.wins}-{standing.losses}
              </p>
            </Tile>
            <Tile label="Win percentage" foot={standing.gamesBehind ? `${standing.gamesBehind} games back` : "Division leader"}>
              <p className={num}>{standing.winPct != null ? standing.winPct.toFixed(3).replace(/^0/, "") : "-"}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(standing.winPct ?? 0) * 100}%` }} />
              </div>
            </Tile>
            <Tile label="Points per game" foot={stats?.oppPointsPerGame != null ? `${stats.oppPointsPerGame.toFixed(1)} allowed` : undefined}>
              <p className={num}>{stats?.pointsPerGame != null ? stats.pointsPerGame.toFixed(1) : "-"}</p>
            </Tile>
            <Tile label="Scoring margin">
              <p className={`${num} ${margin === null ? "" : margin >= 0 ? "text-win" : "text-loss"}`}>
                {margin === null ? "-" : `${margin >= 0 ? "+" : ""}${margin.toFixed(1)}`}
              </p>
            </Tile>
            <Tile label="Streak">
              <p className={`${num} ${streak.dir === "win" ? "text-win" : streak.dir === "loss" ? "text-loss" : ""}`}>{streak.label}</p>
            </Tile>
            <Tile label="Last 10" foot={standing.lastTen ?? undefined}>
              <div className="pt-1">
                <L10Dots record={standing.lastTen} />
              </div>
            </Tile>
          </div>
        )}
      </div>
    </div>
  );
}

function FormChip({ game, teamId }: { game: ScheduleGameLite; teamId: number }) {
  const isHome = game.homeTeamId === teamId;
  const opp = isHome ? game.awayTeam : game.homeTeam;
  const mine = isHome ? game.homeScore : game.awayScore;
  const theirs = isHome ? game.awayScore : game.homeScore;
  const won = mine !== null && theirs !== null && mine > theirs;
  return (
    <Link
      href={`/games/${game.espnId}`}
      className="group flex w-[7.25rem] shrink-0 snap-start flex-col gap-2 rounded-lg bg-surface p-3 outline-none transition-shadow hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className={`text-sm font-bold ${won ? "text-win" : "text-loss"}`}>
        {won ? "W" : "L"} {mine !== null && theirs !== null ? `${Math.max(mine, theirs)}-${Math.min(mine, theirs)}` : ""}
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold">
        <CircularBadge src={opp.logoUrl} alt="" size="sm" />
        {opp.abbreviation}
      </span>
      <span className="text-xs text-foreground/55">
        {isHome ? "Home" : "Away"}, {new Date(game.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </span>
    </Link>
  );
}

function UpNext({ game, teamId }: { game: ScheduleGameLite; teamId: number }) {
  const isHome = game.homeTeamId === teamId;
  const opp = isHome ? game.awayTeam : game.homeTeam;
  return (
    <Link
      href={`/games/${game.espnId}`}
      className="group flex w-[15rem] shrink-0 snap-start flex-col justify-between gap-3 rounded-lg border-l-[3px] border-accent bg-surface p-4 outline-none transition-shadow hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="text-sm font-semibold text-accent">Up next</span>
      <span className="flex items-center gap-3">
        <CircularBadge src={opp.logoUrl} alt="" size="md" />
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold leading-tight">
            {isHome ? "vs" : "at"} {opp.name}
          </span>
          <span className="block text-sm text-foreground/60">
            {new Date(game.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })},{" "}
            {new Date(game.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Home tab for layout A: recent form first (the last games as a strip, with
 * the next game leading it), then news beside the division table and the
 * team's statistical leaders. */
export function TeamHomeA({
  teamId,
  divisionName,
  completedGames,
  nextGame,
  news,
  divisionStandings,
  leadersCard,
  onFullSchedule,
}: {
  teamId: number;
  divisionName: string | undefined;
  completedGames: ScheduleGameLite[];
  nextGame: ScheduleGameLite | null;
  news: NewsLite[];
  divisionStandings: DivisionRowLite[];
  leadersCard: ReactNode;
  onFullSchedule: () => void;
}) {
  const latest = completedGames[0] ?? null;
  return (
    <div className="space-y-10">
      <section aria-labelledby="form-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="form-h" className="text-2xl">
            Recent form
          </h2>
          <button type="button" onClick={onFullSchedule} className="text-sm font-semibold text-accent hover:underline">
            Full schedule
          </button>
        </div>
        {!nextGame && completedGames.length === 0 ? (
          <p className="rounded-lg bg-surface p-5 text-foreground/70">No games have been played or scheduled yet this season.</p>
        ) : (
          <div className="-mx-5 flex scroll-px-5 snap-x gap-2 overflow-x-auto px-5 pb-2 lg:mx-0 lg:px-0">
            {nextGame && <UpNext game={nextGame} teamId={teamId} />}
            {completedGames.slice(0, 10).map((g) => (
              <FormChip key={g.id} game={g} teamId={teamId} />
            ))}
          </div>
        )}
      </section>

      <div className="grid items-start gap-10 xl:grid-cols-[1fr_24rem]">
        <section aria-labelledby="news-h">
          <h2 id="news-h" className="mb-3 text-2xl">
            News
          </h2>
          {latest && (
            <Link
              href={`/games/${latest.espnId}`}
              className="mb-3 flex items-center justify-between gap-4 rounded-lg bg-surface p-4 outline-none hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>
                <span className="block text-sm text-foreground/55">Latest game</span>
                <span className="block text-lg font-semibold">
                  {latest.awayTeam.displayName} {latest.awayScore}, {latest.homeTeam.displayName} {latest.homeScore}
                </span>
              </span>
              <span className="shrink-0 text-sm text-foreground/55">{new Date(latest.date).toLocaleDateString()}</span>
            </Link>
          )}
          {news.length === 0 && <p className="rounded-lg bg-surface p-5 text-foreground/70">No recent news about this team.</p>}
          <ul className="space-y-3">
            {news.map((a) => (
              <li key={a.id} className="flex gap-4 rounded-lg bg-surface p-4">
                {a.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
                  <img src={a.imageUrl} alt="" className="hidden h-24 w-40 shrink-0 rounded-md object-cover sm:block" />
                )}
                <div className="min-w-0 space-y-1">
                  <a
                    href={a.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold leading-snug outline-none hover:text-accent focus-visible:underline"
                  >
                    {a.headline}
                  </a>
                  {a.description && a.description !== a.headline && <p className="line-clamp-2 text-foreground/70">{a.description}</p>}
                  {a.publishedAt && <p className="text-xs text-foreground/50">{new Date(a.publishedAt).toLocaleDateString()}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="div-h">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="div-h" className="text-2xl">
                {divisionName} Division
              </h2>
              <Link href="/standings" className="text-sm font-semibold text-accent hover:underline">
                Full standings
              </Link>
            </div>
            <div className="overflow-hidden rounded-lg bg-surface">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-b border-border text-sm text-foreground/60">
                    <th className="py-2 pl-4 text-left font-semibold">Team</th>
                    <th className="px-2 py-2 text-right font-semibold">W</th>
                    <th className="px-2 py-2 text-right font-semibold">L</th>
                    <th className="px-2 py-2 text-right font-semibold">GB</th>
                    <th className="py-2 pl-2 pr-4 text-right font-semibold">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {divisionStandings.map((s) => {
                    const st = parseStreak(s.streak);
                    const me = s.team.id === teamId;
                    return (
                      <tr key={s.id} className={`border-b border-border/60 last:border-b-0 ${me ? "bg-surface-muted font-semibold" : ""}`}>
                        <td className="py-2 pl-4">
                          <Link href={`/teams/${s.team.id}`} className="flex items-center gap-2 outline-none hover:text-accent focus-visible:underline">
                            <CircularBadge src={s.team.logoUrl} alt="" size="sm" />
                            {s.team.displayName}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.wins}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.losses}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.gamesBehind ? s.gamesBehind : "-"}</td>
                        <td className={`py-2 pl-2 pr-4 text-right font-bold tabular-nums ${st.dir === "win" ? "text-win" : st.dir === "loss" ? "text-loss" : ""}`}>
                          {st.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {leadersCard}
        </aside>
      </div>
    </div>
  );
}
