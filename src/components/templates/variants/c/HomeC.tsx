"use client";

import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";
import { gamePhase, gameStatusText, useHomeData, useToday, type ScoreboardGame } from "@/components/templates/home-data";
import { ErrorLine, LiveDot } from "@/components/templates/variants/shared";

function GameRow({ game }: { game: ScoreboardGame }) {
  const phase = gamePhase(game);
  const scored = phase !== "scheduled";
  return (
    <li>
      <Link
        href={`/games/${game.espnId}`}
        className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 rounded-xl px-3 py-3.5 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[5.5rem_1fr_6rem]"
      >
        <span className={`flex items-center gap-1.5 text-sm font-medium tabular-nums ${phase === "live" ? "text-loss" : "text-foreground/55"}`}>
          {phase === "live" && <LiveDot />}
          {gameStatusText(game)}
        </span>
        <span className="flex flex-col gap-1.5 text-lg sm:flex-row sm:items-center sm:gap-5">
          {[game.away, game.home].map((t, i) => (
            <span key={t.abbreviation} className="flex items-center gap-2.5">
              <CircularBadge src={t.logoUrl} alt="" size="sm" />
              <span className="font-medium">{t.name}</span>
              {scored && <span className="font-mono text-base tabular-nums text-foreground/70">{t.score}</span>}
              {i === 0 && <span className="hidden text-foreground/30 sm:inline">at</span>}
            </span>
          ))}
        </span>
        <span className="text-right text-sm text-foreground/55 tabular-nums">{game.spreadDetails ?? ""}</span>
      </Link>
    </li>
  );
}

export function HomeC() {
  const { games, standings, leaders, headlines } = useHomeData();
  const today = useToday();
  const count = games.data?.length;

  return (
    <div className="space-y-20">
      <header>
        <h1 className="text-[clamp(3rem,9vw,6.5rem)] leading-[0.95]">
          {count === undefined ? " " : count === 0 ? "No games tonight." : `${count} ${count === 1 ? "game" : "games"} tonight.`}
        </h1>
        <p className="mt-5 text-xl text-foreground/55">
          {today?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </header>

      <section aria-label="Tonight's games">
        {games.isError && <ErrorLine what="today's games" />}
        {games.isLoading && <div aria-hidden="true" className="h-72 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />}
        <ul className="-mx-3 divide-y divide-border/70">{games.data?.map((g) => <GameRow key={g.espnId} game={g} />)}</ul>
      </section>

      <section aria-labelledby="leaders-h">
        <h2 id="leaders-h" className="mb-8 text-3xl">
          Leading the league
        </h2>
        {leaders.isError && <ErrorLine what="league leaders" />}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {leaders.data?.map((c) => {
            const l = c.leaders[0];
            return (
              <div key={c.key}>
                <dd className="font-display text-7xl font-semibold leading-none tracking-tight tabular-nums">{l?.displayValue}</dd>
                <dt className="mt-2 text-base font-medium">{c.label}</dt>
                <dd className="mt-0.5 text-sm text-foreground/55">{l?.displayName}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section aria-labelledby="standings-h">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 id="standings-h" className="text-3xl">
            The top of each conference
          </h2>
          <Link href="/standings" className="text-sm font-medium text-accent hover:underline">
            Full standings
          </Link>
        </div>
        {standings.isError && <ErrorLine what="standings" />}
        <div className="grid gap-12 md:grid-cols-2">
          {standings.data?.map((c) => (
            <div key={c.conferenceName}>
              <h3 className="mb-3 text-lg font-medium text-foreground/55">{c.conferenceName}</h3>
              <ol>
                {c.standings.slice(0, 6).map((r, i) => (
                  <li key={r.team.id}>
                    <Link
                      href={`/teams/${r.team.id}`}
                      className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 border-b border-border/60 py-3 outline-none hover:text-accent focus-visible:underline"
                    >
                      <span className="font-mono text-sm text-foreground/40 tabular-nums">{i + 1}</span>
                      <span className="flex items-center gap-2.5 text-lg font-medium">
                        <CircularBadge src={r.team.logoUrl} alt="" size="sm" />
                        {r.team.displayName}
                      </span>
                      <span className="font-mono text-base tabular-nums">
                        {r.wins}-{r.losses}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="news-h" className="max-w-2xl">
        <h2 id="news-h" className="mb-6 text-3xl">
          Worth reading
        </h2>
        {headlines.isError && <ErrorLine what="headlines" />}
        <ul className="space-y-4">
          {headlines.data?.slice(0, 5).map((h) => (
            <li key={h.id}>
              {h.url ? (
                <a href={h.url} target="_blank" rel="noreferrer" className="text-xl leading-snug outline-none hover:text-accent focus-visible:underline">
                  {h.headline}
                </a>
              ) : (
                <span className="text-xl leading-snug">{h.headline}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
