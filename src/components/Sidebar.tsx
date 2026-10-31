import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const SECTIONS = [
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/news", label: "News" },
  { href: "/betting", label: "Betting" },
];

/** Persistent section nav at `lg` and above, replacing the old top-only
 * link row. Below `lg` the same sections are reached through SiteNav's
 * hamburger menu instead — there isn't room for a sidebar that narrow. */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:gap-7 lg:bg-surface lg:px-5 lg:py-7">
      <Link href="/" className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground">
        NBA Stats
      </Link>
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
      <ThemeToggle />
    </aside>
  );
}
