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
    return <div className="h-8 w-14 rounded-full bg-surface-muted" aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative h-8 w-14 rounded-full border border-border bg-surface-muted transition-colors"
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-accent transition-transform ${
          isDark ? "translate-x-[26px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
