"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { CalendarDays, Crown, Dices, LayoutList, Menu, Newspaper, ShieldHalf, Sunrise, X, type LucideIcon } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CircularBadge } from "@/components/CircularBadge";
import { SiteSearch } from "@/components/SiteSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { gamePhase, gameStatusText } from "@/components/home/home-data";
import { useScoreboardToday, type ScoreboardGame } from "@/components/shell/useScoreboardToday";
import { Wordmark } from "@/components/shell/Wordmark";

export const SECTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/briefing", label: "Briefing", icon: Sunrise },
  { href: "/scoreboard", label: "Scoreboard", icon: CalendarDays },
  { href: "/standings", label: "Standings", icon: LayoutList },
  { href: "/teams", label: "Teams", icon: ShieldHalf },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/betting", label: "Betting", icon: Dices },
  { href: "/betting/history", label: "Cover Story", icon: Crown },
];

/** The section whose href is the longest prefix of the current path wins, so
 * "/betting/history" lights "Cover Story" and not "Betting" as well. */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const s of SECTIONS) {
    const hit = pathname === s.href || pathname.startsWith(`${s.href}/`);
    if (hit && (!best || s.href.length > best.length)) best = s.href;
  }
  return best;
}

function RailNav({ pathname }: { pathname: string | null }) {
  const active = pathname ? activeHref(pathname) : null;
  return (
    <nav aria-label="Sections" className="flex flex-col gap-0.5 px-3">
      {SECTIONS.map((s) => {
        const on = s.href === active;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
              on ? "bg-surface-muted text-foreground" : "text-foreground/65 hover:bg-surface-muted/70 hover:text-foreground"
            }`}
          >
            {on && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />}
            <s.icon className={`h-[18px] w-[18px] shrink-0 ${on ? "text-accent" : ""}`} strokeWidth={1.75} />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TonightRow({ game }: { game: ScoreboardGame }) {
  const phase = gamePhase(game);
  const away = game.away.score;
  const home = game.home.score;
  const final = phase === "final" && away !== null && home !== null;
  const awayWon = final && away! > home!;
  const homeWon = final && home! > away!;
  const showScore = phase !== "scheduled";

  return (
    <Link
      href={`/games/${game.espnId}`}
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-md px-3 py-2 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex flex-col gap-1">
        {[
          { t: game.away, won: awayWon },
          { t: game.home, won: homeWon },
        ].map(({ t, won }) => (
          <span key={t.abbreviation} className={`flex items-center gap-2 text-sm ${won || !final ? "font-semibold" : "text-foreground/55"}`}>
            <CircularBadge src={t.logoUrl} alt="" size="xs" />
            {t.abbreviation}
          </span>
        ))}
      </span>
      <span className="flex flex-col items-end gap-1 font-display text-base font-bold leading-none tabular-nums">
        {showScore ? (
          <>
            <span className={final && !awayWon ? "text-foreground/55" : ""}>{away ?? "-"}</span>
            <span className={final && !homeWon ? "text-foreground/55" : ""}>{home ?? "-"}</span>
          </>
        ) : (
          <span className="pt-1 text-xs font-semibold text-foreground/60">{gameStatusText(game)}</span>
        )}
      </span>
      {showScore && (
        <span className="col-span-2 mt-1 flex items-center gap-1.5 text-xs font-medium text-foreground/60">
          {phase === "live" && (
            <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-loss opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-loss" />
            </span>
          )}
          <span className={phase === "live" ? "font-semibold text-loss" : ""}>{gameStatusText(game)}</span>
        </span>
      )}
    </Link>
  );
}

function Tonight() {
  const { data: games, isLoading } = useScoreboardToday(true);
  const live = games?.filter((g) => gamePhase(g) === "live").length ?? 0;

  return (
    <section aria-label="Tonight's games" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between px-6 pb-2 pt-1">
        <h2 className="text-lg">Tonight</h2>
        <span className="text-xs font-semibold text-foreground/55">
          {games ? `${games.length} games${live ? `, ${live} live` : ""}` : ""}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {isLoading && (
          <div className="space-y-2 px-3" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none" />
            ))}
          </div>
        )}
        {games?.length === 0 && <p className="px-3 text-sm text-foreground/60">No games scheduled today.</p>}
        <div className="flex flex-col divide-y divide-border/70">
          {games?.map((g) => (
            <TonightRow key={g.espnId} game={g} />
          ))}
        </div>
      </div>
    </section>
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

function Rail() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:gap-5 lg:border-r lg:border-border lg:bg-surface lg:pt-6">
      <div className="px-6 text-[15px]">
        <Wordmark />
      </div>
      <div className="px-4">
        <SiteSearch />
      </div>
      <RailNav pathname={pathname} />
      <div className="mx-6 h-px bg-border" aria-hidden="true" />
      <Tonight />
      <div className="flex items-center justify-between border-t border-border px-6 py-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}

/** Below `lg` the rail is hidden: wordmark, theme and a menu button instead. */
function MobileBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = pathname ? activeHref(pathname) : null;
  return (
    <header className="sticky top-0 z-40 bg-surface px-5 py-3 lg:hidden">
      <div className="flex items-center gap-4 text-[13px]">
        <Wordmark />
        <span className="ml-auto">
          <ThemeToggle />
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav-a"
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-md p-2 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav-a" className="mt-3 space-y-3 pb-2">
          <SiteSearch />
          <nav aria-label="Sections" className="grid grid-cols-2 gap-1">
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                aria-current={s.href === active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[15px] font-semibold ${
                  s.href === active ? "bg-surface-muted text-accent" : "text-foreground/75"
                }`}
              >
                <s.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

/** Briefing pages use their own quiet theme, scoped to a wrapper around the
 * page content so the rail keeps the app palette. */
function BriefingScope({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scoped = pathname === "/briefing" || pathname?.startsWith("/briefing/");
  return scoped ? (
    <div data-scope="briefing" className="flex flex-1 flex-col bg-background font-sans text-foreground">
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}

/** The app shell: a fixed left rail that combines navigation with a live
 * "Tonight" list, so the night's scores are visible from every page. */
export function AppShell({ children }: { children: ReactNode }) {
  const main = (
    <main className="flex-1 px-5 py-6 lg:px-10 lg:py-8">
      <div className="mx-auto w-full max-w-[1280px] 2xl:max-w-[1500px]">
        <Suspense fallback={<div className="mb-4 h-5" aria-hidden="true" />}>
          <CrumbUnlessHome />
        </Suspense>
        {children}
      </div>
    </main>
  );
  return (
    <div className="min-h-full lg:flex lg:[--sidebar-w:16rem] lg:[--sidebar-w-half:8rem]">
      <Suspense fallback={<aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:bg-surface" />}>
        <Rail />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<header className="h-14 bg-surface lg:hidden" />}>
          <MobileBar />
        </Suspense>
        <Suspense fallback={main}>
          <BriefingScope>{main}</BriefingScope>
        </Suspense>
      </div>
    </div>
  );
}
