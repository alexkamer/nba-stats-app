"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECTIONS } from "@/components/Sidebar";
import { SiteSearch } from "@/components/SiteSearch";

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
          {open ? <X className="h-4 w-4" strokeWidth={1.5} /> : <Menu className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      </div>

      <div className="mt-3">
        <SiteSearch />
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3 pb-1">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-foreground/82 hover:text-foreground"
            >
              <section.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {section.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
