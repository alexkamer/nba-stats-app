# Design

## Context

See proposal.md - Why. The team Performance tab (`src/components/TeamPerformanceTab.tsx`) already fetches `/api/teams/[teamId]/performance?year=<n>`, which returns a single season's summary/splits/per-game rows via `summarizePerformance` in `lib/accuracy/performance-summary.ts`. The season the tab shows is controlled by a dropdown on the team page (`selectedSeasonYear` in `src/app/teams/[teamId]/page.tsx`), which is unrelated to this change. `TeamGamePerformance.seasonId` already exists on every row, so a cross-season rollup is a `GROUP BY seasonId` away — no new column or ingest step.

## Goals / Non-Goals

**Goals:**
- One query path for the trend data that is independent of whichever single season the rest of the tab is currently showing.
- Reuse the existing average/label conventions (null-for-empty-split, `averageLabel`'s ±1.5 band) rather than inventing new ones.

**Non-Goals:**
- Changing what the season dropdown does to the rest of the tab (splits, per-game list) - this change only adds a new section that ignores that dropdown.
- A multi-season option on the Teams index leaderboard (explicitly deferred - see conversation that scoped this change to the team tab only).
- Playoff or other non-regular-season rows - excluded the same way the rest of the capability excludes them.

## Decisions

**Fetch the trend data from the same team-performance route, via a response field that does not depend on `year`.** Rather than add a new route, add a `seasonTrend` array to the existing `/api/teams/[teamId]/performance` response, computed from all of that team's `TeamGamePerformance` rows (not filtered by the request's `year`). This avoids a second round trip from the tab and keeps the one-route-per-tab-section pattern simple; the route already does one `findMany` for the selected season, so this adds one more unfiltered-by-year query for the same team.

- `seasonTrend: { year: number, averageCoverMargin: number, label: "OVER" | "AS_EXPECTED" | "UNDER", games: number }[]`, one entry per season with at least one graded game, sorted ascending by year.
- Computed by a new pure function in `lib/accuracy/performance-summary.ts` (e.g. `summarizeSeasonTrend(rows)`) that groups by season year and reuses `averageCoverMargin`/`averageLabel` from `grade-performance.ts`, mirroring `summarizePerformance`'s shape.

**UI: a compact bar/line row plus a small table, not a full redesign of the tab.** The trend section sits below the existing per-game list, using the same chart primitives already in `TeamPerformanceTab.tsx` (positive/negative bars) scaled to one bar per season instead of one per game, plus a short list (year, average, label, games) using the existing `AverageLabelPill`/`formatMargin` helpers. No new charting dependency.

## Risks / Trade-offs

- **Team identity across relocations/renames**: `TeamGamePerformance.teamId` is the current team row, which already handles this correctly for the rest of the capability (teams are tracked by a stable id regardless of historical name/city) - no new handling needed here.
- **Many seasons for a long-tenured team**: a team with a decade of graded seasons produces a trend list that could get visually busy; mitigated by using a compact one-row-per-season treatment rather than per-game-style detail. If it still reads as cluttered after real usage, a "last N seasons" cap can be added later without a schema or API shape change.
