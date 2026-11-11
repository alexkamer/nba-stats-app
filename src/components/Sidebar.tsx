import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  CalendarDays,
  ChevronLeft,
  LayoutList,
  Newspaper,
  ShieldHalf,
  Dices,
  Crown,
  Sunrise,
  type LucideIcon,
} from "lucide-react";

export const SECTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/briefing", label: "Briefing", icon: Sunrise },
  { href: "/scoreboard", label: "Scoreboard", icon: CalendarDays },
  { href: "/standings", label: "Standings", icon: LayoutList },
  { href: "/teams", label: "Teams", icon: ShieldHalf },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/betting", label: "Betting", icon: Dices },
  { href: "/betting/history", label: "Cover Story", icon: Crown },
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
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <nav className="flex flex-col gap-1 text-sm font-semibold">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-foreground/70 hover:bg-surface-muted hover:text-foreground"
          >
            <section.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {section.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
