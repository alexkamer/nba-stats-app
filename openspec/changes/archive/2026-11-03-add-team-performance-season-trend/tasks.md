# Tasks

## 1. Rollup logic

- [x] 1.1 Add `summarizeSeasonTrend(rows)` to `lib/accuracy/performance-summary.ts`: groups rows by season year, reuses `averageCoverMargin`/`averageLabel` from `grade-performance.ts`, returns entries sorted ascending by year, omitting seasons with no rows; unit tests covering a team with graded games across multiple seasons, a team with one season, and a team with none (returns an empty array)

## 2. API

- [x] 2.1 In `src/app/api/teams/[teamId]/performance/route.ts`, query all of the team's `TeamGamePerformance` rows (regular season, any season) independent of the request's `year`, pass them to `summarizeSeasonTrend`, and add the result as `seasonTrend` in the response; verify via manual request for a team with multi-season data and confirm the field does not change when `?year=` is varied

## 3. UI

- [x] 3.1 Add a season-trend section to `src/components/TeamPerformanceTab.tsx` below the existing per-game list: a compact per-season bar row (reusing the existing positive/negative bar treatment, one bar per season) plus a short list (year, average cover margin, label, game count) using the existing `AverageLabelPill`/`formatMargin` helpers; verify against a team with multiple graded seasons
- [x] 3.2 Add the no-data message for a team with `seasonTrend` empty; verify against a team with no graded games in any season

## 4. Integration verification

- [x] 4.1 Verify the trend section's per-season average for one season matches that same team/season's season-average shown when the team page's season dropdown is switched to that season
- [x] 4.2 Verify desktop and mobile layouts, and light and dark themes
- [x] 4.3 Run `npx tsc --noEmit`, the lint script, and the unit tests; fix any failures
- [x] 4.4 Run `openspec validate add-team-performance-season-trend` and fix any reported issues
