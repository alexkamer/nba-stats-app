"use client";

import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";
import {
  gamePhase,
  gameStatusText,
  useHomeData,
  type ScoreboardGame,
} from "@/components/templates/home-data";
import { LeadersStrip, StandingsTable } from "@/components/templates/variants/sections";
import { ErrorLine, LiveDot, featuredGame } from "@/components/templates/variants/shared";

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between border-b-2 border-foreground pb-2">
      <h2 className="text-3xl leading-none">{children}</h2>
      {action}
    </div>
  );
}

function Lead({ game }: { game: ScoreboardGame }) {
  const phase = gamePhase(game);
  const scored = phase !== "scheduled";
  return (
    <Link
      href={`/games/${game.espnId}`}
      className="group grid items-center gap-6 bg-[#0a1730] px-6 py-7 text-white outline-none focus-visible:ring-4 focus-visible:ring-accent md:grid-cols-[1fr_auto_1fr] md:px-10"
    >
      {[game.away, game.home].map((t, i) => (
        <div key={t.abbreviation} className={`flex items-center gap-5 ${i === 1 ? "md:order-3 md:flex-row-reverse md:text-right" : ""}`}>
          <CircularBadge src={t.logoUrl} alt="" size="lg" className="!h-20 !w-20 bg-white/95 p-1.5" />
          <div>
            <p className="font-display text-4xl font-bold leading-none sm:text-5xl">{t.name}</p>
            <p className="mt-1.5 text-sm text-white/65">{t.overallRecord}</p>
          </div>
          {scored && <span className="ml-auto font-display text-6xl font-bold tabular-nums md:ml-0 md:px-4">{t.score}</span>}
        </div>
      ))}
      <div className="text-center md:order-2">
        <p className={`flex items-center justify-center gap-2 text-lg font-semibold ${phase === "live" ? "text-[#ff7b86]" : ""}`}>
          {phase === "live" && <LiveDot />}
          {gameStatusText(game)}
        </p>
        {game.spreadDetails && <p className="mt-0.5 text-sm text-white/65">Line {game.spreadDetails}</p>}
        <p className="mt-3 text-sm font-semibold text-[#9db8ff] group-hover:underline">Game preview</p>
      </div>
    </Link>
  );
}

function Board({ games, loading, error }: { games?: ScoreboardGame[]; loading: boolean; error: boolean }) {
  return (
    <section aria-labelledby="board-h">
      <SectionTitle>
        <span id="board-h">Today&apos;s board</span>
      </SectionTitle>
      {error && <ErrorLine what="today's games" />}
      {games?.length === 0 && <p className="py-6 text-foreground/70">No games today. Check back when the next slate is set.</p>}
      {loading && <div aria-hidden="true" className="h-48 animate-pulse bg-surface motion-reduce:animate-none" />}
      {games && games.length > 0 && (
        <ul className="bg-surface">
          <li aria-hidden="true" className="hidden grid-cols-[7.5rem_1fr_1fr_6rem] gap-4 border-b border-border px-4 py-2 text-sm font-semibold text-foreground/60 sm:grid">
            <span>Status</span>
            <span>Away</span>
            <span>Home</span>
            <span className="text-right">Line</span>
          </li>
          {games.map((g) => {
            const phase = gamePhase(g);
            return (
              <li key={g.espnId} className="border-b border-border/70 last:border-b-0">
                <Link
                  href={`/games/${g.espnId}`}
                  className="grid items-center gap-x-4 gap-y-2 px-4 py-3 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted sm:grid-cols-[7.5rem_1fr_1fr_6rem]"
                >
                  <span className={`flex items-center justify-between gap-2 text-[15px] font-semibold sm:justify-start ${phase === "live" ? "text-loss" : "text-foreground/70"}`}>
                    <span className="flex items-center gap-2">
                      {phase === "live" && <LiveDot />}
                      {gameStatusText(g)}
                    </span>
                    <span className="tabular-nums sm:hidden">{g.spreadDetails ?? ""}</span>
                  </span>
                  {[g.away, g.home].map((t) => (
                    <span key={t.abbreviation} className="flex items-center gap-2.5 text-lg font-semibold">
                      <CircularBadge src={t.logoUrl} alt="" size="sm" />
                      {t.name}
                      <span className="text-sm font-normal text-foreground/55">{t.overallRecord}</span>
                      {phase !== "scheduled" && <span className="ml-auto font-display text-xl tabular-nums sm:ml-1">{t.score}</span>}
                    </span>
                  ))}
                  <span className="hidden text-right text-[15px] font-semibold tabular-nums sm:block">{g.spreadDetails ?? "-"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function HomeB() {
  const { games, standings, leaders, headlines } = useHomeData();
  const lead = featuredGame(games.data);

  return (
    <div className="space-y-12">
      {lead && <Lead game={lead} />}
      <Board games={games.data} loading={games.isLoading} error={games.isError} />
      <section aria-labelledby="leaders-h">
        <SectionTitle>
          <span id="leaders-h">League leaders</span>
        </SectionTitle>
        {leaders.isError && <ErrorLine what="league leaders" />}
        <LeadersStrip categories={leaders.data} />
      </section>
      <section aria-labelledby="standings-h">
        <SectionTitle
          action={
            <Link href="/standings" className="text-sm font-semibold text-accent hover:underline">
              Full standings
            </Link>
          }
        >
          <span id="standings-h">Standings</span>
        </SectionTitle>
        {standings.isError && <ErrorLine what="standings" />}
        <div className="grid gap-6 xl:grid-cols-2">{standings.data?.map((c) => <StandingsTable key={c.conferenceName} conf={c} />)}</div>
        <p className="mt-3 text-sm text-foreground/60">The heavy line marks the cut for direct qualification (sixth) and the end of the play-in (tenth).</p>
      </section>
      <section aria-labelledby="news-h">
        <SectionTitle
          action={
            <Link href="/news" className="text-sm font-semibold text-accent hover:underline">
              All news
            </Link>
          }
        >
          <span id="news-h">Headlines</span>
        </SectionTitle>
        {headlines.isError && <ErrorLine what="headlines" />}
        <ul className="grid gap-x-10 md:grid-cols-2">
          {headlines.data?.map((h) => (
            <li key={h.id} className="border-b border-border py-3">
              {h.url ? (
                <a href={h.url} target="_blank" rel="noreferrer" className="text-lg font-semibold leading-snug outline-none hover:text-accent focus-visible:underline">
                  {h.headline}
                </a>
              ) : (
                <span className="text-lg font-semibold leading-snug">{h.headline}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
