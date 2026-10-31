"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECTIONS } from "@/components/Sidebar";

/** Desktop top bar (`lg` and above), always visible regardless of the
 * sidebar's collapsed state. Mirrors Sidebar's section links. Sidebar
 * holds its own toggle to collapse itself; this only shows a toggle to
 * re-expand it, since a collapsed Sidebar renders nothing and so can't
 * hold one itself. */
export function TopBar({ collapsed, onToggleSidebar }: { collapsed: boolean; onToggleSidebar: () => void }) {
  return (
    <header className="hidden lg:flex lg:items-center lg:gap-6 lg:bg-surface lg:px-6 lg:py-4">
      {collapsed && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Show sidebar"
          className="rounded-md p-1.5 text-foreground/60 hover:bg-surface-muted hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <Link href="/" className="font-display text-lg font-extrabold uppercase tracking-tight text-foreground">
        NBA Stats
      </Link>
      <nav className="flex items-center gap-5 text-sm font-semibold">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="text-foreground/70 hover:text-foreground">
            {section.label}
          </Link>
        ))}
      </nav>
      <span className="ml-auto">
        <ThemeToggle />
      </span>
    </header>
  );
}
