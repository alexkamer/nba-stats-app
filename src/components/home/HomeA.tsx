"use client";

import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";
import {
  gamePhase,
  gameStatusText,
  useHomeData,
  useToday,
  type ScoreboardGame,
} from "@/components/home/home-data";
import { LeadersStrip, StandingsTable } from "@/components/home/sections";

function Panel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface">
      <div className="flex flex-col gap-3 px-5 pb-1 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-2xl">{title}</h2>
        {aside}
      </div>
      <div className="px-5 pb-5 pt-2">{children}</div>
    </section>
  );
}

function ErrorLine({ what }: { what: string }) {
  return <p className="text-sm text-loss">Couldn&apos;t load {what}. Refresh the page to try again.</p>;
}

function GameCard({ game }: { game: ScoreboardGame }) {
  const phase = gamePhase(game);
  const scored = phase !== "scheduled";
  const final = phase === "final" && game.away.score !== null && game.home.score !== null;
  const awayWon = final && game.away.score! > game.home.score!;
  const homeWon = final && game.home.score! > game.away.score!;

  return (
    <Link
      href={`/games/${game.espnId}`}
      className="group flex w-[16.5rem] shrink-0 snap-start flex-col gap-3 rounded-lg bg-surface p-4 outline-none ring-accent sm:w-auto transition-shadow hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:ring-2"
    >
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className={`flex items-center gap-1.5 ${phase === "live" ? "text-loss" : "text-foreground/60"}`}>
          {phase === "live" && (
            <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-loss opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-loss" />
            </span>
          )}
          {gameStatusText(game)}
        </span>
        {game.spreadDetails && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-foreground/70">{game.spreadDetails}</span>}
      </div>
      {[
        { t: game.away, won: awayWon },
        { t: game.home, won: homeWon },
      ].map(({ t, won }) => (
        <div key={t.abbreviation} className="flex items-center gap-3">
          <CircularBadge src={t.logoUrl} alt="" size="md" />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[17px] leading-tight ${final && !won ? "font-medium text-foreground/60" : "font-semibold"}`}>{t.name}</p>
            <p className="text-xs text-foreground/55">{t.overallRecord ?? ""}</p>
          </div>
          {scored && (
            <span className={`font-display text-4xl font-bold leading-none tabular-nums ${final && !won ? "text-foreground/40" : ""}`}>
              {t.score ?? "-"}
            </span>
          )}
        </div>
      ))}
    </Link>
  );
}

function Slate({ games, loading, error }: { games?: ScoreboardGame[]; loading: boolean; error: boolean }) {
  return (
    <section aria-labelledby="slate-h">
      <h2 id="slate-h" className="mb-3 text-2xl">
        Tonight&apos;s slate
      </h2>
      {error && <ErrorLine what="today's games" />}
      {games?.length === 0 && (
        <p className="rounded-lg bg-surface p-5 text-foreground/70">No games today. The next slate will show up here as soon as it&apos;s scheduled.</p>
      )}
      <div className="-mx-5 flex scroll-px-5 snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 sm:[grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} aria-hidden="true" className="h-[142px] w-[16.5rem] shrink-0 animate-pulse rounded-lg bg-surface motion-reduce:animate-none sm:w-auto" />
          ))}
        {games?.map((g) => <GameCard key={g.espnId} game={g} />)}
      </div>
    </section>
  );
}

export function HomeA() {
  const { games, standings, leaders, headlines, briefing } = useHomeData();
  const today = useToday();
  const live = games.data?.filter((g) => gamePhase(g) === "live").length ?? 0;
  const teaser = briefing.data?.summary?.replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-10">
      <header className="grid items-end gap-6 xl:grid-cols-[1fr_26rem]">
        <div>
          <h1 className="text-4xl leading-none sm:text-6xl">
            {today ? today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : " "}
          </h1>
          <p className="mt-3 text-lg text-foreground/70">
            {games.data
              ? games.data.length === 0
                ? "No games on the schedule."
                : `${games.data.length} ${games.data.length === 1 ? "game" : "games"} tonight${live ? `, ${live} in progress` : ""}.`
              : "Loading tonight's games."}
          </p>
        </div>
        {teaser && (
          <Link
            href="/briefing"
            className="group block rounded-lg border-l-[3px] border-accent bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <p className="line-clamp-3 text-[15px] leading-snug text-foreground/85">{teaser}</p>
            <span className="mt-2 inline-block text-sm font-semibold text-accent group-hover:underline">Read today&apos;s briefing</span>
          </Link>
        )}
      </header>

      <Slate games={games.data} loading={games.isLoading} error={games.isError} />

      <section aria-labelledby="leaders-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="leaders-h" className="text-2xl">
            League leaders
          </h2>
          <Link href="/leaders" className="text-sm font-semibold text-accent hover:underline">
            See all leaders
          </Link>
        </div>
        {leaders.isError && <ErrorLine what="league leaders" />}
        {leaders.isLoading && <div aria-hidden="true" className="h-64 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />}
        <div className="rounded-lg sm:overflow-hidden">
          <LeadersStrip categories={leaders.data} />
        </div>
      </section>

      <section aria-labelledby="standings-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="standings-h" className="text-2xl">
            Standings
          </h2>
          <Link href="/standings" className="text-sm font-semibold text-accent hover:underline">
            Full standings
          </Link>
        </div>
        {standings.isError && <ErrorLine what="standings" />}
        {standings.isLoading && <div aria-hidden="true" className="h-64 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />}
        <div className="grid gap-6 xl:grid-cols-2">
          {standings.data?.map((c) => (
            <div key={c.conferenceName} className="overflow-hidden rounded-lg">
              <StandingsTable conf={c} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-foreground/60">The heavy line marks the cut for direct qualification (sixth) and the end of the play-in (tenth).</p>
      </section>

      <Panel title="Headlines">
        {headlines.isError && <ErrorLine what="headlines" />}
        <ul className="grid gap-x-10 md:grid-cols-2">
          {headlines.data?.map((h) => (
            <li key={h.id} className="border-b border-border/70 py-3">
              {h.url ? (
                <a href={h.url} target="_blank" rel="noreferrer" className="font-medium leading-snug outline-none hover:text-accent focus-visible:underline">
                  {h.headline}
                </a>
              ) : (
                <span className="font-medium leading-snug">{h.headline}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
