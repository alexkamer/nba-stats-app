"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECTIONS } from "@/components/Sidebar";

/** Mobile top bar — shown below `lg`, where Sidebar (the desktop
 * equivalent) is hidden. Collapses the same section list Sidebar shows
 * into a hamburger menu so the header doesn't have to fit every link on
 * one row at phone widths. */
export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="text-sm font-medium lg:hidden">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="font-display text-lg font-extrabold uppercase tracking-tight text-foreground"
          onClick={() => setOpen(false)}
        >
          NBA Stats
        </Link>

        <span className="ml-auto">
          <ThemeToggle />
        </span>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-md border border-border p-2"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            ) : (
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3 pb-1">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              onClick={() => setOpen(false)}
              className="text-foreground/82 hover:text-foreground"
            >
              {section.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
