"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { ScoreboardGame } from "@/components/templates/home-data";
import { gamePhase } from "@/components/templates/home-data";

export function ErrorLine({ what }: { what: string }) {
  return <p className="text-sm text-loss">Couldn&apos;t load {what}. Refresh the page to try again.</p>;
}

/** Numeric spread from "NY -8.5" (null when there is no line). */
export function spreadValue(g: ScoreboardGame): number | null {
  const m = g.spreadDetails ? /(-?\d+(?:\.\d+)?)/.exec(g.spreadDetails) : null;
  return m ? Math.abs(parseFloat(m[1])) : null;
}

/** The night's lead game: a live one if any, otherwise the tightest line. */
export function featuredGame(games?: ScoreboardGame[]): ScoreboardGame | undefined {
  if (!games?.length) return undefined;
  const live = games.find((g) => gamePhase(g) === "live");
  if (live) return live;
  return [...games].sort((a, b) => (spreadValue(a) ?? 99) - (spreadValue(b) ?? 99))[0];
}

/** Ten small blocks for a "9-1" last-ten record: wins then losses. */
export function L10Dots({ record }: { record: string | null }) {
  const m = record ? /^(\d+)-(\d+)$/.exec(record) : null;
  if (!m) return <span className="text-foreground/40">-</span>;
  const w = parseInt(m[1], 10);
  const total = w + parseInt(m[2], 10);
  return (
    <span className="inline-flex gap-[2px]" role="img" aria-label={`${record} over the last ten games`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`h-3 w-[5px] rounded-[1px] ${i < w ? "bg-win" : "bg-loss/80"}`} />
      ))}
    </span>
  );
}

export function LiveDot() {
  return (
    <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-loss opacity-70 motion-reduce:animate-none" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-loss" />
    </span>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex rounded-md bg-surface-muted p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`rounded-[5px] px-3 py-1 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
              on ? "bg-surface text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact sun/moon toggle for shells too narrow for the full ThemeToggle. */
export function ThemeIconButton({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`rounded-md p-2 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
    </button>
  );
}
