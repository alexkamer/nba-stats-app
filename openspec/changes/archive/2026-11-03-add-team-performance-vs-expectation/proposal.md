# Proposal

## Why

The app records whether a team covered the spread (`TeamCoverRecord`, shipped via Cover Story), but a cover is a yes/no. It can't say how well a team performed relative to what the market expected. A favorite that wins by 3 as a 13.5-point favorite did far worse than expected despite winning; an underdog that loses by 2 as a 3-point underdog did fine despite losing. There is also no way to scan a team's season (or the whole league) to see who is consistently over- or underperforming expectations, and no explanation of *why* individual games went the way they did (a star sitting out, an early blowout, a late collapse).

## What Changes

- Add a per-game, per-team **performance vs. expectation** measure: `coverMargin = actualMargin - expectedMargin`, where the expected margin comes from the final recorded spread (`Odds.spread`, the line in effect at tip-off). Each graded game also gets a qualitative label (strongly over, over, as expected, under, strongly under) derived from tunable thresholds.
- Add rule-based **reason tags** per team per game, computed from data already ingested: star player out (from the pre-game `PlayerAvailability` snapshot), early blowout, late collapse, garbage-time swing (play-by-play from `Play`), and unusually hot or cold shooting (from `TeamGameStat`).
- Add a new **Performance tab** on the team page showing the season average cover margin, splits (last 10 games, as favorite, as underdog, home/away), a per-game cover-margin chart, and a per-game list with line, result, margin vs. line, label, and tags.
- Add a **league leaderboard** to the Teams index page ranking all teams by average cover margin ("who is over/underperforming"), with a link through to each team's Performance tab.
- Add a new ingest step that computes and persists the per-game performance rows once games go final, wired into the existing sync pipeline.

Out of scope for this change: LLM-written game narratives, in-game injury detection (availability is a pre-game snapshot only), playoffs, multi-season browsing, and any modification of how `Odds` lines are captured.

## Capabilities

### New Capabilities
- `team-game-performance-tracking`: computes and persists, per team per final game with a recorded spread, the expected margin, actual margin, cover margin, qualitative label, and reason tags; defines the thresholds and tag rules.
- `team-performance-views`: the team page Performance tab (season summary, splits, trend chart, per-game list) and the Teams index league leaderboard, plus their API routes and empty states.

### Modified Capabilities
None. `TeamCoverRecord` and `grade-cover.ts` are reused as-is (not modified); the new capability reads from the same `Odds` and `Game` data.

## Impact

- **Schema**: new Prisma models `TeamGamePerformance` (one row per `(gameId, teamId)`) and `TeamGamePerformanceTag` (child rows); a migration. No change to `Odds`, `Game`, or `TeamCoverRecord`.
- **Lib**: new pure module under `lib/accuracy/` (e.g. `grade-performance.ts`) for margin math and labels, plus a pure tag-derivation module with unit tests.
- **Ingest**: new `ingest/compute-team-game-performance.ts`, added to `SCRIPTS` in `ingest/run-all-sync.ts` after `compute-cover-records.ts`.
- **API**: new routes `src/app/api/teams/performance/route.ts` (league leaderboard) and `src/app/api/teams/[teamId]/performance/route.ts` (team detail).
- **UI**: a new tab in `src/app/teams/[teamId]/page.tsx` (`TEAM_TABS`) and a leaderboard section in `src/app/teams/page.tsx`.
- **Dependencies on existing data**: depends on `Odds` coverage, which is sparse in some eras, so games with no recorded spread are simply excluded. Tags that need `Play` or `PlayerAvailability` data are omitted when that data is missing for a game.
