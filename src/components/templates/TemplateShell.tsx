"use client";

import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SiteNav } from "@/components/SiteNav";
import { StubShell } from "@/components/templates/StubShell";
import { useLayout, VARIANTS } from "@/components/templates/layout-context";
import { useScoreboardToday } from "@/components/templates/useScoreboardToday";
import { SHELLS } from "@/components/templates/variants";

/** The single switch point between the current shell and the five drafts.
 * Anything that isn't a known variant (including before the client has
 * resolved the layout) renders the unchanged baseline. */
export function TemplateShell({ children }: { children: ReactNode }) {
  const { layout, ready } = useLayout();
  // Only A (live-games list) and B (ticker) show scoreboard data in the shell;
  // the other layouts shouldn't pay for polling. The shells read this same
  // query (shared key) once they're built.
  useScoreboardToday(ready && (layout === "a" || layout === "b"));

  if (!ready || layout === "base") {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-surface px-6 py-4 lg:hidden">
            <SiteNav />
          </header>
          <main className="flex-1 px-6 py-6">
            <div className="max-w-6xl w-full mx-auto xl:max-w-7xl 2xl:max-w-[1600px]">
              <Suspense fallback={<div className="h-5" aria-hidden="true" />}>
                <Breadcrumb />
              </Suspense>
              <div className="mt-4">{children}</div>
            </div>
          </main>
        </div>
      </AppShell>
    );
  }

  const Shell = SHELLS[layout];
  if (Shell) return <Shell>{children}</Shell>;

  const variant = VARIANTS.find((v) => v.id === layout)!;
  // Stub until this variant's real shell lands.
  return (
    <StubShell name={`${layout.toUpperCase()} ${variant.name}`} hasSidebar={layout === "a"}>
      {children}
    </StubShell>
  );
}
