"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BriefingContent } from "@/components/BriefingContent";
import { Skeleton, SkeletonRow } from "@/components/Skeleton";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Explicit-date briefing — `/briefing/[date]` (see daily-briefing-page).
 * An invalid or malformed date renders an inline message rather than a
 * crash, same convention as the rest of this app's client-driven routes
 * (no server-side `notFound()` is used anywhere else in this codebase).
 * `useParams` has to live behind Suspense, same pattern as
 * teams/[teamId]/page.tsx — reading it during server prerender is a
 * Next.js breaking change this app's AGENTS.md calls out. */
export default function BriefingDatePage() {
  return (
    <Suspense fallback={<BriefingDateSkeleton />}>
      <BriefingDateContent />
    </Suspense>
  );
}

function BriefingDateContent() {
  const params = useParams<{ date: string }>();
  const date = params.date;

  if (!DATE_KEY_RE.test(date)) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Baseline Briefing</h1>
        <p className="text-foreground/72 text-sm">
          &quot;{date}&quot; isn&apos;t a valid briefing date (expected YYYY-MM-DD).
        </p>
      </div>
    );
  }

  return <BriefingContent dateKey={date} />;
}

function BriefingDateSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-56" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-surface p-4">
          {Array.from({ length: 4 }).map((_, j) => (
            <SkeletonRow key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}
