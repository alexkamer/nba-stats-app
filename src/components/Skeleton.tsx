/** Pulsing placeholder bar — sized via className (width/height) by the caller
 * so a skeleton can mimic the shape of the content it's standing in for. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} />;
}

/** A row of avatar + two text bars, for list items (leaders, standings) still loading. */
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="h-3.5 w-10 shrink-0" />
    </div>
  );
}

/** A game-card-shaped placeholder: two team rows with logo/name/score bars. */
export function SkeletonGameCard({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 rounded-md border border-border p-3 ${className}`}>
      <Skeleton className="h-3 w-20" />
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
          <Skeleton className="h-4 w-6 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Shared shape for player/team/game detail pages: a logo/photo, title and
 * meta line, a row of stat chips, a tab bar, then a couple of content
 * blocks — approximates enough of each page's header to avoid a layout
 * jump once real data swaps in. */
export function SkeletonDetailPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-20 rounded-lg" />
        ))}
      </div>
      <div className="flex gap-4 border-b border-border pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-16" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

/** Article-shaped placeholder: title, meta line, hero image, paragraph bars. */
export function SkeletonArticle() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
