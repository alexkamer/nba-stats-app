"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const BreadcrumbLabelContext = createContext<{
  label: string | null;
  setLabel: (label: string | null) => void;
} | null>(null);

/** Wraps the app once in layout.tsx so any page can override the last
 * breadcrumb crumb with its fetched entity's display name instead of the
 * raw route id. */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <BreadcrumbLabelContext.Provider value={{ label, setLabel }}>{children}</BreadcrumbLabelContext.Provider>;
}

/** Call from a detail page once its entity (team/player/game) has loaded,
 * so the breadcrumb's final segment reads "Boston Celtics" instead of a
 * raw id. Clears on unmount/change so a stale label can't leak into the
 * next page the user navigates to. */
export function useBreadcrumbLabel(label: string | null | undefined) {
  const ctx = useContext(BreadcrumbLabelContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setLabel(label ?? null);
    return () => ctx.setLabel(null);
  }, [ctx, label]);
}

const SEGMENT_LABELS: Record<string, string> = {
  scoreboard: "Scoreboard",
  standings: "Standings",
  teams: "Teams",
  players: "Players",
  games: "Games",
  news: "News",
  betting: "Betting",
  research: "Research",
};

/** Derives its trail from the current route rather than a separate nav
 * config, so it can't drift from the routes that actually exist. */
export function Breadcrumb() {
  const ctx = useContext(BreadcrumbLabelContext);
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Home className="h-3.5 w-3.5" strokeWidth={2} />
        Home
      </nav>
    );
  }

  const crumbs = segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    const label = SEGMENT_LABELS[segment] ?? (isLast && ctx?.label ? ctx.label : decodeURIComponent(segment));
    return { href, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-foreground/72">
      <Link href="/" className="flex items-center gap-1.5 hover:text-foreground">
        <Home className="h-3.5 w-3.5" strokeWidth={2} />
        Home
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-foreground/40" aria-hidden="true" strokeWidth={2} />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
