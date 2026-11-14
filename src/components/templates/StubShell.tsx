"use client";

import type { ReactNode } from "react";

/** Placeholder shell for a variant that hasn't been built yet. Sets the
 * `--sidebar-w` vars the way a real shell must (so `FullBleed` stays aligned),
 * and shows a visible sidebar column when `hasSidebar` is true. Replaced by
 * the real ShellA-ShellE in the variant tasks. */
export function StubShell({ name, hasSidebar, children }: { name: string; hasSidebar: boolean; children: ReactNode }) {
  return (
    <div
      className={`min-h-full flex flex-col ${
        hasSidebar ? "lg:[--sidebar-w:13rem] lg:[--sidebar-w-half:6.5rem]" : "lg:[--sidebar-w:0px] lg:[--sidebar-w-half:0px]"
      }`}
    >
      <div className="flex-1 flex flex-col lg:flex-row">
        {hasSidebar && (
          <aside className="hidden lg:flex lg:w-52 lg:shrink-0 lg:bg-surface lg:px-5 lg:py-7 text-sm font-semibold">
            {name} sidebar (stub)
          </aside>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-surface px-6 py-3 text-sm font-semibold">{name} (stub)</header>
          <main className="flex-1 px-6 py-6">
            <div className="max-w-6xl w-full mx-auto xl:max-w-7xl 2xl:max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
