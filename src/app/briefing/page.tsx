"use client";

import { Suspense } from "react";
import { BriefingContent } from "@/components/BriefingContent";
import { Skeleton, SkeletonRow } from "@/components/Skeleton";

// Deferred behind Suspense for the same reason as the home/scoreboard
// pages: reading "today" has to happen per-visit on the client, not during
// server prerender (see src/app/page.tsx's comment).
export default function BriefingPage() {
  return (
    <Suspense fallback={<BriefingSkeleton />}>
      <BriefingContent dateKey={null} />
    </Suspense>
  );
}

function BriefingSkeleton() {
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
