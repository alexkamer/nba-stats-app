import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const SECTIONS = [
  { href: "/standings", label: "Standings", initial: "S" },
  { href: "/teams", label: "Teams", initial: "T" },
  { href: "/players", label: "Players", initial: "P" },
  { href: "/news", label: "News", initial: "N" },
  { href: "/betting", label: "Betting", initial: "B" },
];

/** Persistent section nav at `lg` and above, replacing the old top-only
 * link row. Below `lg` the same sections are reached through SiteNav's
 * hamburger menu instead — there isn't room for a sidebar that narrow.
 * `collapsed` shrinks it to an icon-rail (initials in place of full
 * labels) while keeping every link reachable; `AppShell` owns and
 * persists that state. */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`hidden lg:flex lg:shrink-0 lg:flex-col lg:gap-7 lg:bg-surface lg:py-7 ${
        collapsed ? "lg:w-16 lg:px-2" : "lg:w-52 lg:px-5"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
        {!collapsed && (
          <Link href="/" className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground">
            NBA Stats
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1.5 text-foreground/60 hover:bg-surface-muted hover:text-foreground"
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M12.5 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <nav className={`flex flex-col gap-1 text-sm font-semibold ${collapsed ? "items-center" : ""}`}>
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            title={collapsed ? section.label : undefined}
            className={`rounded-md text-foreground/70 hover:bg-surface-muted hover:text-foreground ${
              collapsed ? "flex h-9 w-9 items-center justify-center text-xs font-bold" : "px-2.5 py-2"
            }`}
          >
            {collapsed ? section.initial : section.label}
          </Link>
        ))}
      </nav>
      <div className={collapsed ? "flex justify-center" : undefined}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
