"use client";

import Link from "next/link";
import { CircularBadge } from "@/components/CircularBadge";
import { gamePhase, gameStatusText, useHomeData, type ScoreboardGame } from "@/components/templates/home-data";
import { ErrorLine, featuredGame, spreadValue } from "@/components/templates/variants/shared";

function leadHeadline(g: ScoreboardGame): string {
  const phase = gamePhase(g);
  if (phase === "final" && g.home.score !== null && g.away.score !== null) {
    const homeWon = g.home.score > g.away.score;
    const [w, l] = homeWon ? [g.home, g.away] : [g.away, g.home];
    return `${w.name} beat ${l.name}, ${Math.max(g.home.score, g.away.score)}-${Math.min(g.home.score, g.away.score)}`;
  }
  if (phase === "live") return `${g.away.name} and ${g.home.name}, live now`;
  return `${g.away.name} visit ${g.home.name}`;
}

function leadDeck(g: ScoreboardGame): string {
  const spread = spreadValue(g);
  const bits = [
    g.away.overallRecord && g.home.overallRecord ? `${g.away.name} come in ${g.away.overallRecord}, ${g.home.name} ${g.home.overallRecord}.` : "",
    spread !== null ? `It is the tightest line on tonight's slate (${g.spreadDetails}).` : "",
  ];
  return bits.filter(Boolean).join(" ");
}

function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-border ${className}`} />;
}

export function HomeE() {
  const { games, standings, leaders, headlines, briefing } = useHomeData();
  const lead = featuredGame(games.data);
  const others = games.data?.filter((g) => g.espnId !== lead?.espnId) ?? [];
  const summary = briefing.data?.summary?.replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-14">
      <h1 className="sr-only">Home</h1>
      <section aria-label="Lead story" className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <div>
          {games.isError && <ErrorLine what="today's games" />}
          {games.isLoading && <div aria-hidden="true" className="h-72 animate-pulse bg-surface-muted motion-reduce:animate-none" />}
          {lead && (
            <article>
              <Link href={`/games/${lead.espnId}`} className="group block outline-none focus-visible:underline">
                <h2 className="text-balance text-5xl leading-[1.04] group-hover:text-accent sm:text-7xl">{leadHeadline(lead)}</h2>
              </Link>
              <p className="mt-5 max-w-[34ch] text-xl leading-snug text-foreground/75 [text-wrap:pretty] sm:max-w-[48ch] sm:text-[22px]">{leadDeck(lead)}</p>
              <div className="mt-8 flex items-center gap-6">
                {[lead.away, lead.home].map((t) => (
                  <div key={t.abbreviation} className="flex items-center gap-3">
                    <CircularBadge src={t.logoUrl} alt="" size="lg" />
                    <div>
                      <p className="font-display text-2xl leading-none">{t.abbreviation}</p>
                      {gamePhase(lead) !== "scheduled" && <p className="font-display text-3xl tabular-nums">{t.score}</p>}
                    </div>
                  </div>
                ))}
                <p className="ml-2 text-foreground/60">{gameStatusText(lead)}</p>
              </div>
            </article>
          )}
          {summary && (
            <blockquote className="mt-10 max-w-[56ch] border-l-2 border-accent pl-5 font-display text-xl leading-relaxed text-foreground/85">
              <p className="line-clamp-4">{summary}</p>
              <footer className="mt-2 font-sans text-sm">
                <Link href="/briefing" className="font-semibold text-accent hover:underline">
                  Read the full briefing
                </Link>
              </footer>
            </blockquote>
          )}
        </div>

        <aside aria-label="More games tonight" className="lg:border-l lg:border-border lg:pl-8">
          <h2 className="mb-4 text-2xl">Also tonight</h2>
          <ul>
            {others.map((g) => (
              <li key={g.espnId} className="border-b border-border py-3 first:pt-0">
                <Link href={`/games/${g.espnId}`} className="block outline-none hover:text-accent focus-visible:underline">
                  <p className="text-lg font-medium leading-snug">
                    {g.away.name} at {g.home.name}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground/60">
                    {gameStatusText(g)}
                    {g.spreadDetails ? `, line ${g.spreadDetails}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <Rule />

      <section aria-labelledby="leaders-h">
        <h2 id="leaders-h" className="mb-6 text-3xl">
          Leaders
        </h2>
        {leaders.isError && <ErrorLine what="league leaders" />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5 lg:gap-x-0 lg:divide-x lg:divide-border">
          {leaders.data?.map((c) => (
            <div key={c.key} className="lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <p className="text-sm text-foreground/60">{c.label}</p>
              <p className="mt-1 font-display text-6xl leading-none tabular-nums">{c.leaders[0]?.displayValue}</p>
              <p className="mt-2 font-medium">{c.leaders[0]?.displayName}</p>
              <p className="text-sm text-foreground/60">
                then {c.leaders[1]?.displayName} ({c.leaders[1]?.displayValue})
              </p>
            </div>
          ))}
        </div>
      </section>

      <Rule />

      <section className="grid gap-12 lg:grid-cols-[3fr_2fr]">
        <div aria-labelledby="standings-h">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 id="standings-h" className="text-3xl">
              Standings
            </h2>
            <Link href="/standings" className="text-sm font-semibold text-accent hover:underline">
              Full table
            </Link>
          </div>
          {standings.isError && <ErrorLine what="standings" />}
          <div className="grid gap-10 sm:grid-cols-2">
            {standings.data?.map((c) => (
              <div key={c.conferenceName}>
                <h3 className="mb-2 text-xl italic text-foreground/70">{c.conferenceName}</h3>
                <ol>
                  {c.standings.slice(0, 8).map((r) => (
                    <li key={r.team.id} className="border-b border-border">
                      <Link href={`/teams/${r.team.id}`} className="flex items-baseline gap-3 py-2 outline-none hover:text-accent focus-visible:underline">
                        <span className="w-4 text-sm text-foreground/45 tabular-nums">{r.conferenceRank}</span>
                        <span className="flex-1 text-[17px]">{r.team.displayName}</span>
                        <span className="tabular-nums text-foreground/70">
                          {r.wins}-{r.losses}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>

        <div aria-labelledby="news-h">
          <h2 id="news-h" className="mb-6 text-3xl">
            Reading list
          </h2>
          {headlines.isError && <ErrorLine what="headlines" />}
          <ul className="space-y-5">
            {headlines.data?.map((h) => (
              <li key={h.id} className="border-b border-border pb-5 last:border-b-0">
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noreferrer" className="font-display text-[22px] leading-snug outline-none hover:text-accent focus-visible:underline">
                    {h.headline}
                  </a>
                ) : (
                  <span className="font-display text-[22px] leading-snug">{h.headline}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
