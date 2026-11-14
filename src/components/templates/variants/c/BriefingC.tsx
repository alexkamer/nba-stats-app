"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBreadcrumbLabel } from "@/components/Breadcrumb";
import {
  STAT_LABELS,
  fetchBriefing,
  formatDateHeading,
  type BestBetPick,
  type BriefingPayload,
  type FinalGame,
} from "@/components/BriefingContent";
import { CircularBadge } from "@/components/CircularBadge";

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 className="text-3xl">{title}</h2>
        {note && <span className="text-sm text-foreground/55">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-lg text-foreground/60">{children}</p>;
}

/** Final scores as quiet rows: the winner reads at full strength and the
 * loser steps back, so a column of results can be scanned by weight alone. */
function Results({ games }: { games: FinalGame[] }) {
  return (
    <ul className="divide-y divide-border/70">
      {games.map((g) => {
        const a = g.awayScore ?? 0;
        const h = g.homeScore ?? 0;
        return (
          <li key={g.id} className="grid grid-cols-1 gap-y-1.5 py-4 sm:grid-cols-2 sm:gap-x-6">
            {[
              { t: g.awayTeam, s: g.awayScore, won: a > h },
              { t: g.homeTeam, s: g.homeScore, won: h > a },
            ].map(({ t, s, won }) => (
              <span key={t.id} className={`flex items-center gap-3 text-xl ${won ? "font-semibold" : "text-foreground/50"}`}>
                <CircularBadge src={t.logoUrl} alt="" size="sm" />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="font-display text-3xl tabular-nums">{s ?? "-"}</span>
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

function Picks({ picks, empty }: { picks: BestBetPick[] | null; empty: string }) {
  if (!picks || picks.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-border/70">
      {picks.map((p) => (
        <li key={`${p.player.id}-${p.statType}`} className="flex items-center gap-3 py-3 text-lg">
          <CircularBadge src={p.player.headshotUrl} alt="" size="sm" />
          <span className="flex-1 truncate">
            <span className="font-medium">{p.player.displayName}</span>
            <span className="ml-2 text-foreground/55">{STAT_LABELS[p.statType] ?? p.statType}</span>
          </span>
          <span className="font-mono text-base tabular-nums">
            {p.lean === "OVER" ? "Over" : p.lean === "UNDER" ? "Under" : ""} {p.line}
          </span>
          {p.gradedCorrect !== null && (
            <span className={`w-14 text-right text-sm font-semibold ${p.gradedCorrect ? "text-win" : "text-loss"}`}>
              {p.gradedCorrect ? "Hit" : "Missed"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const INJURY_PREVIEW = 12;

/** Every injured player in tonight's games can run to dozens of rows, so the
 * list shows the first few and expands on request. */
function Injuries({ rows }: { rows: NonNullable<BriefingPayload["injuryReport"]> }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, INJURY_PREVIEW);
  return (
    <>
      <ul className="grid gap-x-10 sm:grid-cols-2">
        {shown.map((r) => (
          <li key={r.playerId} className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2.5">
            <span className="truncate text-lg">
              {r.player.displayName}
              {r.team && <span className="ml-2 text-sm text-foreground/50">{r.team.abbreviation}</span>}
            </span>
            <span className={`shrink-0 text-sm font-semibold ${r.status === "OUT" ? "text-loss" : "text-foreground/60"}`}>
              {r.status === "OUT" ? "Out" : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > INJURY_PREVIEW && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-expanded={all}
          className="mt-4 rounded-lg px-3 py-2 text-sm font-medium text-accent outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
        >
          {all ? "Show fewer" : `Show all ${rows.length} players`}
        </button>
      )}
    </>
  );
}

function DayNav({ data }: { data?: BriefingPayload }) {
  const link = "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent";
  return (
    <nav aria-label="Briefing days" className="flex items-center gap-1">
      {data?.prevDate ? (
        <Link href={`/briefing/${data.prevDate}`} className={`${link} hover:bg-surface`}>
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          Earlier
        </Link>
      ) : (
        <span className={`${link} text-foreground/30`}>
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          Earlier
        </span>
      )}
      {data?.nextDate ? (
        <Link href={`/briefing/${data.nextDate}`} className={`${link} hover:bg-surface`}>
          Later
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      ) : (
        <span className={`${link} text-foreground/30`}>
          Later
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
    </nav>
  );
}

/** The Briefing in variant C's voice (design D9): one reading column, large
 * quiet type, big numerals, whitespace instead of card chrome. Reads the same
 * `/api/briefing` payload and renders the same sections, in the same order, as
 * the existing page. */
export function BriefingC({ dateKey }: { dateKey: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["briefing", "c", dateKey ?? "today"],
    queryFn: () => fetchBriefing(dateKey),
  });
  useBreadcrumbLabel(data ? formatDateHeading(data.date) : null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-6">
        <h1 className="text-5xl">Baseline Briefing</h1>
        <p className="text-xl text-foreground/70">{(error as Error).message}</p>
        <Link href="/briefing" className="inline-block text-accent hover:underline">
          Go to today&apos;s briefing
        </Link>
      </div>
    );
  }

  const topLeader = data?.topPerformers.leaders[0];
  const standingsByConf = data?.standings
    ? Object.entries(
        data.standings.reduce<Record<string, NonNullable<BriefingPayload["standings"]>>>((acc, s) => {
          (acc[s.conferenceName] ??= []).push(s);
          return acc;
        }, {}),
      )
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-20 pb-12">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.95]">Baseline Briefing</h1>
          <DayNav data={data} />
        </div>
        <p className="mt-5 text-xl text-foreground/55">{data ? formatDateHeading(data.date) : " "}</p>
        {data?.summary && <p className="mt-8 max-w-[34ch] text-balance text-[26px] leading-[1.25] sm:max-w-[40ch] sm:text-3xl">{data.summary}</p>}
      </header>

      {isLoading && (
        <div aria-hidden="true" className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {data && (
        <>
          <Section title="Last night" note={formatDateHeading(data.yesterdaysScores.date)}>
            {data.yesterdaysScores.games.length === 0 ? <Empty>No games were played that day.</Empty> : <Results games={data.yesterdaysScores.games} />}
          </Section>

          <Section title="Top performers">
            {data.topPerformers.leaders.length === 0 && data.topPerformers.topScorers.length === 0 ? (
              <Empty>No performances were recorded that day.</Empty>
            ) : (
              <div className="space-y-10">
                {topLeader && (
                  <div className="flex items-end gap-5">
                    <p className="font-display text-8xl font-semibold leading-none tracking-tight tabular-nums">{topLeader.pointsReboundsAssists}</p>
                    <div className="pb-1">
                      <p className="flex items-center gap-2 text-xl font-medium">
                        <CircularBadge src={topLeader.player.headshotUrl} alt="" size="md" />
                        {topLeader.player.displayName}
                      </p>
                      <p className="mt-1 text-foreground/55">
                        Points, rebounds and assists{topLeader.hadTripleDouble ? ", with a triple-double" : ""}
                      </p>
                    </div>
                  </div>
                )}
                {data.topPerformers.topScorers.length > 0 && (
                  <ol className="divide-y divide-border/70">
                    {data.topPerformers.topScorers.map((s, i) => (
                      <li key={s.playerId} className="flex items-center gap-4 py-3 text-lg">
                        <span className="w-5 font-mono text-sm text-foreground/40">{i + 1}</span>
                        <CircularBadge src={s.player.headshotUrl} alt="" size="sm" />
                        <span className="flex-1 truncate font-medium">
                          {s.player.displayName}
                          {s.team && <span className="ml-2 text-foreground/50">{s.team.abbreviation}</span>}
                        </span>
                        <span className="font-display text-2xl tabular-nums">{s.points}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Section>

          {data.headlines !== null && (
            <Section title="Worth reading">
              {data.headlines.length === 0 ? (
                <Empty>No headlines are available.</Empty>
              ) : (
                <ul className="space-y-5">
                  {data.headlines.map((a) => (
                    <li key={a.id}>
                      <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-2xl leading-snug outline-none hover:text-accent focus-visible:underline">
                        {a.headline}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {data.injuryReport !== null && (
            <Section title="Injury report" note="Tonight's games">
              {data.injuryReport.length === 0 ? (
                <Empty>No injury concerns were reported for tonight&apos;s games.</Empty>
              ) : (
                <Injuries rows={data.injuryReport} />
              )}
            </Section>
          )}

          {data.standings !== null && (
            <Section
              title="Standings"
              note={
                <Link href="/standings" className="font-medium text-accent hover:underline">
                  Full standings
                </Link>
              }
            >
              {standingsByConf.length === 0 ? (
                <Empty>No standings are available.</Empty>
              ) : (
                <div className="grid gap-12 sm:grid-cols-2">
                  {standingsByConf.map(([conf, rows]) => (
                    <div key={conf}>
                      <h3 className="mb-3 text-lg font-medium text-foreground/55">{conf}</h3>
                      <ol>
                        {rows
                          .slice()
                          .sort((a, b) => (a.conferenceRank ?? 99) - (b.conferenceRank ?? 99))
                          .slice(0, 8)
                          .map((s) => (
                            <li key={s.team.id} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 border-b border-border/60 py-2.5 text-lg">
                              <span className="font-mono text-sm text-foreground/40">{s.conferenceRank}</span>
                              <span className="flex items-center gap-2.5 truncate">
                                <CircularBadge src={s.team.logoUrl} alt="" size="sm" />
                                {s.team.name}
                              </span>
                              <span className="font-mono text-base tabular-nums">
                                {s.wins}-{s.losses}
                              </span>
                            </li>
                          ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {data.schedule !== null && (
            <Section title="Tonight">
              {data.schedule.length === 0 ? (
                <Empty>No games are scheduled tonight.</Empty>
              ) : (
                <ul className="divide-y divide-border/70">
                  {data.schedule.map((g) => (
                    <li key={g.id} className="py-4">
                      <p className="flex items-center gap-3 text-xl font-medium">
                        <CircularBadge src={g.awayTeam.logoUrl} alt="" size="sm" />
                        {g.awayTeam.name}
                        <span className="text-foreground/35">at</span>
                        <CircularBadge src={g.homeTeam.logoUrl} alt="" size="sm" />
                        {g.homeTeam.name}
                      </p>
                      {(g.pick || g.market) && (
                        <p className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 pl-9 text-base text-foreground/55">
                          {g.pick && (
                            <span>
                              Our projection {g.pick.projectedAwayScore.toFixed(0)} to {g.pick.projectedHomeScore.toFixed(0)}
                            </span>
                          )}
                          {g.market?.spread != null && <span>Spread {g.market.spread}</span>}
                          {g.market?.overUnder != null && <span>Total {g.market.overUnder}</span>}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {data.pastSlate !== null && (
            <Section title="That night" note={formatDateHeading(data.pastSlate.date)}>
              {data.pastSlate.games.length === 0 ? <Empty>No games were played that night.</Empty> : <Results games={data.pastSlate.games} />}
            </Section>
          )}

          <Section
            title="Best bets"
            note={
              <Link href="/betting" className="font-medium text-accent hover:underline">
                Full insights
              </Link>
            }
          >
            <div className="space-y-12">
              <div>
                <h3 className="mb-2 flex items-baseline justify-between text-lg font-medium text-foreground/55">
                  <span>{formatDateHeading(data.bestBets.priorDay.date)}</span>
                  {data.bestBets.priorDay.record && <span className="font-mono text-base">{data.bestBets.priorDay.record.record}</span>}
                </h3>
                <Picks picks={data.bestBets.priorDay.picks} empty="No Best Bets selection is available for that date." />
              </div>
              <div>
                <h3 className="mb-2 text-lg font-medium text-foreground/55">{data.isToday ? "Tonight" : formatDateHeading(data.bestBets.date)}</h3>
                <Picks picks={data.bestBets.picks} empty="No Best Bets selection is available for this date." />
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
