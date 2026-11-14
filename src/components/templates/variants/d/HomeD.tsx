"use client";

import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";
import {
  gamePhase,
  gameStatusText,
  parseStreak,
  useHomeData,
  type Conference,
  type ScoreboardGame,
} from "@/components/templates/home-data";
import { ErrorLine, L10Dots, LiveDot } from "@/components/templates/variants/shared";

function Widget({
  title,
  meta,
  className = "",
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={`flex min-h-0 flex-col rounded border border-border bg-surface ${className}`}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="text-xs text-foreground/50">{meta}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function GamesWidget({ games, loading, error }: { games?: ScoreboardGame[]; loading: boolean; error: boolean }) {
  const live = games?.filter((g) => gamePhase(g) === "live").length ?? 0;
  return (
    <Widget title="Games" meta={games ? `${games.length} today${live ? `, ${live} live` : ""}` : ""} className="xl:col-span-4">
      {error && <p className="p-3"><ErrorLine what="today's games" /></p>}
      {loading && <div aria-hidden="true" className="m-3 h-40 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />}
      {games?.length === 0 && <p className="p-3 text-sm text-foreground/60">No games today.</p>}
      <ul>
        {games?.map((g) => {
          const phase = gamePhase(g);
          const scored = phase !== "scheduled";
          return (
            <li key={g.espnId} className="border-b border-border/60 last:border-b-0">
              <Link
                href={`/games/${g.espnId}`}
                className="grid grid-cols-[3.75rem_1fr_auto] items-center gap-2 px-3 py-2 text-sm outline-none hover:bg-surface-muted focus-visible:bg-surface-muted"
              >
                <span className={`flex items-center gap-1.5 text-xs tabular-nums ${phase === "live" ? "font-semibold text-loss" : "text-foreground/55"}`}>
                  {phase === "live" && <LiveDot />}
                  {gameStatusText(g)}
                </span>
                <span className="flex flex-col gap-1">
                  {[g.away, g.home].map((t) => (
                    <span key={t.abbreviation} className="flex items-center gap-2">
                      <CircularBadge src={t.logoUrl} alt="" size="xs" />
                      <span className="w-9 font-semibold">{t.abbreviation}</span>
                      <span className="text-xs text-foreground/50">{t.overallRecord}</span>
                      {scored && <span className="ml-auto pr-3 font-mono text-sm tabular-nums">{t.score}</span>}
                    </span>
                  ))}
                </span>
                <span className="font-mono text-xs text-foreground/60 tabular-nums">{g.spreadDetails ?? ""}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

function StandingsWidget({ conf }: { conf: Conference }) {
  return (
    <Widget title={conf.conferenceName.replace(" Conference", "")} meta="W-L, last 10, streak" className="xl:col-span-4">
      <table className="w-full text-sm">
        <tbody>
          {conf.standings.slice(0, 15).map((r, i) => {
            const st = parseStreak(r.streak);
            return (
              <tr key={r.team.id} className={`border-b border-border/50 hover:bg-surface-muted ${i === 5 || i === 9 ? "border-b-2 border-b-accent/40" : ""}`}>
                <td className="w-7 py-1.5 pl-3 font-mono text-xs text-foreground/40 tabular-nums">{r.conferenceRank ?? i + 1}</td>
                <td className="py-1.5">
                  <Link href={`/teams/${r.team.id}`} className="flex items-center gap-2 font-semibold outline-none hover:text-accent focus-visible:underline">
                    <CircularBadge src={r.team.logoUrl} alt="" size="xs" />
                    {r.team.abbreviation}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {r.wins}-{r.losses}
                </td>
                <td className="hidden px-2 py-1.5 sm:table-cell">
                  <L10Dots record={r.lastTen} />
                </td>
                <td className={`py-1.5 pl-1 pr-3 text-right font-mono text-xs font-semibold tabular-nums ${st.dir === "win" ? "text-win" : st.dir === "loss" ? "text-loss" : ""}`}>
                  {st.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Widget>
  );
}

/** Variant D has no big page title; the h1 stays for accessibility. */
function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Home</h1>
      {children}
    </>
  );
}

export function HomeD() {
  const { games, standings, leaders, headlines, briefing } = useHomeData();
  const summary = briefing.data?.summary?.replace(/\s+/g, " ").trim();

  return (
    <PageWrap>
      <div className="grid gap-3 xl:grid-cols-12">
        <GamesWidget games={games.data} loading={games.isLoading} error={games.isError} />
        {standings.isError && (
          <p className="xl:col-span-8">
            <ErrorLine what="standings" />
          </p>
        )}
        {standings.data?.map((c) => <StandingsWidget key={c.conferenceName} conf={c} />)}

        <Widget title="Leaders" meta="Top 5 in each category" className="xl:col-span-6">
          {leaders.isError && <p className="p-3"><ErrorLine what="league leaders" /></p>}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3">
            {leaders.data?.map((c) => (
              <div key={c.key} className="border-b border-r border-border/70 p-3">
                <h3 className="mb-2 text-sm font-semibold text-foreground/70">{c.label}</h3>
                <ol className="space-y-1.5">
                  {c.leaders.slice(0, 5).map((l, i) => (
                    <li key={l.displayName} className="flex items-center gap-2 text-sm">
                      <span className="w-3 font-mono text-xs text-foreground/40">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{l.displayName}</span>
                      <span className="text-xs text-foreground/50">{l.teamAbbreviation}</span>
                      <span className={`w-10 text-right font-mono tabular-nums ${i === 0 ? "font-semibold text-accent" : ""}`}>{l.displayValue}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Widget>

        <Widget title="Briefing" meta={<Link href="/briefing" className="text-accent hover:underline">Open</Link>} className="xl:col-span-3">
          <p className="line-clamp-[9] p-3 text-sm leading-relaxed text-foreground/85">{summary ?? (briefing.isLoading ? "Loading." : "No briefing yet today.")}</p>
        </Widget>

        <Widget title="Headlines" meta={<Link href="/news" className="text-accent hover:underline">All news</Link>} className="xl:col-span-3">
          {headlines.isError && <p className="p-3"><ErrorLine what="headlines" /></p>}
          <ul>
            {headlines.data?.map((h) => (
              <li key={h.id} className="border-b border-border/60 px-3 py-2 text-sm last:border-b-0">
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noreferrer" className="outline-none hover:text-accent focus-visible:underline">
                    {h.headline}
                  </a>
                ) : (
                  h.headline
                )}
              </li>
            ))}
          </ul>
        </Widget>
      </div>
    </PageWrap>
  );
}
