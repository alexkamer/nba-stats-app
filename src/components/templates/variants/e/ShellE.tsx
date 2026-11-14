"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SECTIONS } from "@/components/Sidebar";
import { SiteSearch } from "@/components/SiteSearch";
import { useToday } from "@/components/templates/home-data";
import { ThemeIconButton } from "@/components/templates/variants/shared";
import { activeHref } from "@/components/templates/variants/a/ShellA";
import { Wordmark } from "@/components/templates/Wordmark";

function Masthead() {
  const pathname = usePathname();
  const active = pathname ? activeHref(pathname) : null;
  const today = useToday();
  return (
    <header className="px-5 pt-6 lg:px-10">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <p className="hidden text-sm text-foreground/60 sm:block">
            {today?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
          <div className="col-start-2 text-[19px] sm:text-[26px]">
            <Wordmark />
          </div>
          <div className="col-start-3 flex items-center justify-end gap-2">
            <div className="hidden w-52 md:block">
              <SiteSearch />
            </div>
            <ThemeIconButton />
          </div>
        </div>
        <nav aria-label="Sections" className="mt-5 overflow-x-auto border-y border-foreground [scrollbar-width:none]">
          <ul className="flex min-w-max justify-start gap-1 sm:justify-center sm:gap-6">
            {SECTIONS.map((s) => {
              const on = s.href === active;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={on ? "page" : undefined}
                    className={`block px-3 py-2.5 text-[15px] outline-none focus-visible:underline ${
                      on ? "font-semibold text-accent underline decoration-2 underline-offset-[10px]" : "text-foreground/75 hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function CrumbUnlessHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="mb-8">
      <Breadcrumb />
    </div>
  );
}

/** Variant E shell: a centered newspaper masthead (date, wordmark, search)
 * over a ruled section bar. No sidebar; content sits in a reading column. */
export function ShellE({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full lg:[--sidebar-w:0px] lg:[--sidebar-w-half:0px]">
      <Suspense fallback={<div className="h-32" />}>
        <Masthead />
      </Suspense>
      <main className="px-5 pb-20 pt-10 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <Suspense fallback={<div className="mb-8 h-5" aria-hidden="true" />}>
            <CrumbUnlessHome />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
