"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-7 w-24 rounded-sm bg-surface-muted" aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`flex h-7 w-24 overflow-hidden rounded-sm border p-0.5 font-display transition-colors ${
        isDark ? "border-black/40 bg-black" : "border-border bg-surface-muted"
      }`}
    >
      <span
        className={`flex flex-1 items-center justify-center rounded-[1px] text-[10px] font-bold uppercase tracking-wider transition-colors ${
          !isDark ? "bg-accent text-accent-foreground [text-shadow:0_0_6px_var(--accent)]" : "text-white/50"
        }`}
      >
        Light
      </span>
      <span
        className={`flex flex-1 items-center justify-center rounded-[1px] text-[10px] font-bold uppercase tracking-wider transition-colors ${
          isDark ? "bg-accent text-accent-foreground [text-shadow:0_0_6px_var(--accent)]" : "text-foreground/30"
        }`}
      >
        Dark
      </span>
    </button>
  );
}
