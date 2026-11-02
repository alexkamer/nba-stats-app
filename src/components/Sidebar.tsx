import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const SECTIONS = [
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/news", label: "News" },
  { href: "/betting", label: "Betting" },
  { href: "/betting/history", label: "Cover Story" },
];

/** Persistent section nav at `lg` and above. Below `lg` the same sections
 * are reached through SiteNav's hamburger menu instead — there isn't room
 * for a sidebar that narrow. When collapsed, it renders nothing at all
 * rather than shrinking to an icon rail; TopBar shows its own toggle to
 * re-expand it, since a collapsed Sidebar can't hold one itself. */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (collapsed) return null;

  return (
    <aside className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:gap-7 lg:bg-surface lg:px-5 lg:py-7">
      <div className="flex items-center justify-between">
        <ThemeToggle />
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide sidebar"
          className="rounded-md p-1.5 text-foreground/60 hover:bg-surface-muted hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12.5 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <nav className="flex flex-col gap-1 text-sm font-semibold">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-md px-2.5 py-2 text-foreground/70 hover:bg-surface-muted hover:text-foreground"
          >
            {section.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
