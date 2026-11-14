"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SECTIONS } from "@/components/Sidebar";
import { SiteSearch } from "@/components/SiteSearch";
import { ThemeIconButton } from "@/components/templates/variants/shared";
import { activeHref } from "@/components/templates/variants/a/ShellA";
import { Wordmark } from "@/components/templates/Wordmark";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="w-28" />;
  return (
    <time dateTime={now.toISOString()} className="whitespace-nowrap font-mono text-xs text-foreground/60 tabular-nums">
      {now.toLocaleDateString(undefined, { month: "short", day: "numeric" })} {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

function TopBar() {
  const pathname = usePathname();
  const active = pathname ? activeHref(pathname) : null;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="flex h-11 items-center gap-5 px-3 lg:px-4">
        <div className="text-[11px]">
          <Wordmark />
        </div>
        <nav aria-label="Sections" className="flex min-w-0 flex-1 items-stretch self-stretch overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map((s, i) => {
            const on = s.href === active;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 text-[13px] font-medium outline-none focus-visible:bg-surface-muted ${
                  on ? "border-accent text-foreground" : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                <span className="hidden font-mono text-[10px] text-foreground/35 xl:inline">{i + 1}</span>
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden w-60 xl:block">
          <SiteSearch />
        </div>
        <Clock />
        <ThemeIconButton />
      </div>
    </header>
  );
}

function CrumbUnlessHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="mb-3">
      <Breadcrumb />
    </div>
  );
}

/** Variant D shell: a single dense top strip (nav as tabs, clock, theme) and
 * an edge-to-edge workspace, like a trading terminal. */
export function ShellD({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full lg:[--sidebar-w:0px] lg:[--sidebar-w-half:0px]">
      <Suspense fallback={<div className="h-11 border-b border-border bg-surface" />}>
        <TopBar />
      </Suspense>
      <main className="p-3 lg:p-4">
        <div className="mx-auto w-full max-w-[1800px]">
          <Suspense fallback={<div className="mb-3 h-5" aria-hidden="true" />}>
            <CrumbUnlessHome />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
