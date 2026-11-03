# Proposal

## Why

The team Performance tab (`team-performance-views`) already shows one season's cover-margin average and splits at a time, and the team page's existing season dropdown lets a user switch which season it shows. But there's no way to see whether a team's over/underperformance is a one-season blip or a multi-year pattern without manually clicking through every past season and remembering the numbers. `TeamGamePerformance` rows already span many seasons (dev data covers 2013-2027), so the data to answer that already exists — it just isn't rolled up anywhere.

## What Changes

- Add a season-over-season trend section to the Performance tab: the team's average cover margin for each season that has at least one graded game, in chronological order, as a small chart plus a compact per-season list (season label, average cover margin, qualitative label, graded game count).
- This is additive to the existing single-season summary/splits/per-game list — it does not replace or change the season dropdown's existing behavior of switching the rest of the tab to a specific season.
- Add a new API route (or extend the existing team performance route with an additional field) returning the per-season averages for a team across all seasons that have graded games, independent of the currently selected season.

## Capabilities

### Modified Capabilities
- `team-performance-views`: add a requirement for a season-over-season trend section on the team Performance tab, scoped to that team across all its seasons with graded games.

## Impact

- **API**: extend `src/app/api/teams/[teamId]/performance/route.ts` (or add a sibling route) to also return, independent of the `year` query param, a per-season list of `{ year, averageCoverMargin, label, games }` for every season that has at least one `TeamGamePerformance` row for this team.
- **Lib**: extend `lib/accuracy/performance-summary.ts` (or add a sibling function) with a pure function that rolls up rows grouped by season into that per-season list, following the same null-for-empty-split convention as the existing summary.
- **UI**: `src/components/TeamPerformanceTab.tsx` — new trend section, likely reusing the existing bar-chart pattern and `AverageLabelPill`/`formatMargin` helpers from `src/components/performance-display.tsx`.
- **Dependencies on existing data**: reads `TeamGamePerformance` rows across all of a team's seasons; no schema change, no new ingest step. Regular-season scope and the "no data" empty-state convention from `team-performance-views` carry over unchanged.
