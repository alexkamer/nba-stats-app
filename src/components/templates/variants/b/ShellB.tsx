"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SECTIONS } from "@/components/Sidebar";
import { SiteSearch } from "@/components/SiteSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { gamePhase, gameStatusText } from "@/components/templates/home-data";
import { useScoreboardToday, type ScoreboardGame } from "@/components/templates/useScoreboardToday";
import { activeHref } from "@/components/templates/variants/a/ShellA";
import { Wordmark } from "@/components/templates/Wordmark";

function TickerItem({ game }: { game: ScoreboardGame }) {
  const phase = gamePhase(game);
  const scored = phase !== "scheduled";
  return (
    <Link
      href={`/games/${game.espnId}`}
      className="flex shrink-0 items-center gap-3 border-r border-white/15 px-5 py-2 text-[13px] text-white/90 outline-none hover:bg-white/10 focus-visible:bg-white/10"
    >
      <span className="flex items-center gap-2 font-semibold">
        {game.away.abbreviation}
        {scored && <span className="tabular-nums">{game.away.score}</span>}
      </span>
      <span className="flex items-center gap-2 font-semibold">
        {game.home.abbreviation}
        {scored && <span className="tabular-nums">{game.home.score}</span>}
      </span>
      <span className={`text-xs font-semibold ${phase === "live" ? "text-[#ff7b86]" : "text-white/60"}`}>{gameStatusText(game)}</span>
    </Link>
  );
}

/** Scrolling score strip. Duplicates its content so the loop is seamless
 * (translateX -50%), pauses on hover or focus, and becomes a plain
 * horizontally scrollable row when the user prefers reduced motion. */
function Ticker() {
  const { data: games } = useScoreboardToday(true);
  return (
    <div className="tpl-marquee-wrap overflow-hidden bg-[#0a1730]" role="region" aria-label="Tonight's scores">
      {games && games.length > 0 ? (
        <div className="tpl-marquee flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1 ? true : undefined}>
              {games.map((g) => (
                <TickerItem key={`${copy}-${g.espnId}`} game={g} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-2 text-[13px] text-white/60">{games ? "No games today." : "Loading scores."}</p>
      )}
    </div>
  );
}

function Header() {
  const pathname = usePathname();
  const active = pathname ? activeHref(pathname) : null;
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-accent bg-surface">
      <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-5 lg:px-8">
        <div className="py-3 text-[15px]">
          <Wordmark />
        </div>
        <nav aria-label="Sections" className="hidden items-stretch gap-1 self-stretch lg:flex">
          {SECTIONS.map((s) => {
            const on = s.href === active;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex items-center px-3.5 text-[17px] font-semibold outline-none transition-colors focus-visible:bg-surface-muted ${
                  on ? "text-accent" : "text-foreground/75 hover:text-foreground"
                }`}
              >
                {s.label}
                {on && <span aria-hidden="true" className="absolute inset-x-3 -bottom-[3px] h-[3px] bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden w-64 lg:block">
          <SiteSearch />
        </div>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav-b"
            aria-label={open ? "Close menu" : "Open menu"}
            className="p-2 lg:hidden"
          >
            {open ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav-b" className="space-y-3 border-t border-border px-5 pb-4 pt-3 lg:hidden">
          <SiteSearch />
          <nav aria-label="Sections" className="flex flex-col">
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                aria-current={s.href === active ? "page" : undefined}
                className={`border-b border-border/70 py-2.5 text-lg font-semibold ${s.href === active ? "text-accent" : ""}`}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

function CrumbUnlessHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="mb-4">
      <Breadcrumb />
    </div>
  );
}

/** Variant B shell: a navy live-score ticker over a white masthead with
 * heavy underlined navigation, in the manner of a network sports desk. */
export function ShellB({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full lg:[--sidebar-w:0px] lg:[--sidebar-w-half:0px]">
      <Ticker />
      <Suspense fallback={<div className="h-14 border-b-[3px] border-accent bg-surface" />}>
        <Header />
      </Suspense>
      <main className="px-5 py-8 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <Suspense fallback={<div className="mb-4 h-5" aria-hidden="true" />}>
            <CrumbUnlessHome />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
