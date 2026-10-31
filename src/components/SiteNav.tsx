"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/news", label: "News" },
  { href: "/betting", label: "Betting" },
];

/** Site-wide nav — collapses the link list behind a toggle below `sm` so
 * the header never has to fit six items on one row (that overflowed the
 * page horizontally on phone-width screens). */
export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="text-sm font-medium">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-base" onClick={() => setOpen(false)}>
          NBA Stats
        </Link>

        <div className="hidden sm:flex items-center gap-6">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-foreground/82 hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </div>

        <span className="ml-auto hidden sm:inline-flex">
          <ThemeToggle />
        </span>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="ml-auto sm:ml-0 sm:hidden rounded-md border border-border p-2"
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
        <div className="sm:hidden mt-3 flex flex-col gap-3 pb-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-foreground/82 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </div>
      )}
    </nav>
  );
}
