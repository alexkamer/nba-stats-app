"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

const STORAGE_KEY = "sidebar-collapsed";

/** Owns the sidebar's collapsed/expanded state and exposes its current
 * width as CSS variables (`--sidebar-w`/`--sidebar-w-half`) on the shared
 * wrapper, so `FullBleed` sections elsewhere in the tree can stay flush
 * with the sidebar's actual edge regardless of which state it's in. */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  // Stay in the expanded CSS-variable state until mounted, matching
  // ThemeToggle's own pattern — avoids a flash from server-rendered
  // "expanded" markup briefly showing before a stored "collapsed"
  // preference applies post-hydration.
  const isCollapsed = mounted && collapsed;

  return (
    <div
      className={`min-h-full flex flex-col ${
        isCollapsed ? "lg:[--sidebar-w:0px] lg:[--sidebar-w-half:0px]" : "lg:[--sidebar-w:13rem] lg:[--sidebar-w-half:6.5rem]"
      }`}
    >
      <div className="flex-1 flex flex-col lg:flex-row">
        <Sidebar collapsed={isCollapsed} onToggle={toggle} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar collapsed={isCollapsed} onToggleSidebar={toggle} />
          {children}
        </div>
      </div>
    </div>
  );
}
