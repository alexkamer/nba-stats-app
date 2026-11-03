import {
  PerformanceLabelPill,
  TAG_TEXT,
  formatMargin,
  marginColorClass,
  type PerformanceLabelValue,
} from "@/components/performance-display";

export interface TeamPerformanceSummary {
  coverMargin: number;
  label: PerformanceLabelValue;
  tags: string[];
}

interface TeamLike {
  abbreviation: string;
  displayName: string;
}

/** Surfaces a specific game's already-computed performance-vs-the-spread
 * rows (game-performance-context) next to the Odds panel — read-only, no
 * computation here. Renders nothing when either side has no row, since a
 * one-sided card would misleadingly imply the other team wasn't graded. */
export function GamePerformanceCard({
  away,
  home,
  awayPerformance,
  homePerformance,
}: {
  away: TeamLike;
  home: TeamLike;
  awayPerformance: TeamPerformanceSummary | null;
  homePerformance: TeamPerformanceSummary | null;
}) {
  if (!awayPerformance || !homePerformance) return null;

  const rows = [
    { team: away, performance: awayPerformance },
    { team: home, performance: homePerformance },
  ];

  return (
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground/92">Performance vs. the spread</h2>
      </div>
      <div className="space-y-3 px-4 py-3">
        {rows.map(({ team, performance }) => (
          <div key={team.abbreviation} className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground/92">{team.displayName}</p>
              {performance.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {performance.tags.map((tag) => (
                    <span key={tag} className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground/82">
                      {TAG_TEXT[tag] ?? tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className={`text-lg font-semibold ${marginColorClass(performance.coverMargin)}`}>
                {formatMargin(performance.coverMargin)}
              </p>
              <PerformanceLabelPill label={performance.label} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
