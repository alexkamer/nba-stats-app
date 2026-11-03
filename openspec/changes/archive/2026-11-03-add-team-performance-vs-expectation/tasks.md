# Tasks

## 1. Investigation

- [x] 1.1 Confirm the `SeasonType` enum value used for the regular season and how `Game.seasonType` is populated, so the "regular season only" filter uses the right value
- [x] 1.2 Decide how "top 3 players by season minutes" is derived for `STAR_OUT` (from `PlayerSeasonStat` if it carries minutes, else summing `PlayerGameStat` minutes), and verify against dev data
- [x] 1.3 Check what share of `FINAL` games have `Play` rows ingested in the dev database; record the result in design.md Risks if coverage is partial
- [x] 1.4 Spike (read-only): determine whether `Play` descriptions or the ESPN summary expose in-game injury events; capture the finding as a note, no implementation in this change

## 2. Schema

- [x] 2.1 Add `PerformanceLabel` and `PerformanceTag` enums and the `TeamGamePerformance` model (`gameId`, `teamId`, `seasonId`, `opponentTeamId`, `isHome`, `isFavorite`, `spread`, `expectedMargin`, `actualMargin`, `coverMargin`, `label`, `computedAt`; unique `(gameId, teamId)`; index `(seasonId, teamId)`) and the `TeamGamePerformanceTag` child model; run `prisma migrate dev` and verify the migration applies cleanly

## 3. Margin and label logic (team-game-performance-tracking)

- [x] 3.1 Implement `lib/accuracy/grade-performance.ts` with `computeMargins(spread, homeScore, awayScore)` and `labelFor(coverMargin)` using named threshold constants; unit tests for the 13.5-favorite-wins-by-3 case (-10.5), the 3-point-underdog-loses-by-2 case (+1.0), a pick'em, an exact-push case (cover margin 0), threshold boundaries for every label, and a consistency test against `gradeAtsCover` (cover margin > 0 iff COVER, = 0 iff PUSH)
- [x] 3.2 Implement `lib/accuracy/performance-tags.ts` with `deriveTags(input)` and named threshold constants for each rule in design.md; unit tests per tag covering the trigger case, the just-below-threshold case, and the missing-source-data case (tag omitted)

## 4. Ingest

- [x] 4.1 Implement `ingest/compute-team-game-performance.ts`: find `FINAL` regular-season games with non-null `Odds.spread` and no existing `TeamGamePerformance` rows; load scores, `Play` timeline, `PlayerAvailability`, team game FG% vs. season average; compute rows and tags via 3.1 and 3.2; insert both teams' rows and tags in one transaction. Verify by running `npx tsx ingest/compute-team-game-performance.ts` twice against dev data and confirming correct counts after the first run and no changes after the second, and that the two teams' cover margins in a sample game are equal and opposite
- [x] 4.2 Add the script to `SCRIPTS` in `ingest/run-all-sync.ts` immediately after `compute-cover-records.ts`; verify `npx tsx ingest/run-all-sync.ts` runs it in that position without error

## 5. API routes (team-performance-views)

- [x] 5.1 Add `src/app/api/teams/performance/route.ts` returning, for the current regular season, each team's average cover margin, graded game count, and label ranked descending, excluding teams with no graded games; verify via manual request against dev data
- [x] 5.2 Add `src/app/api/teams/[teamId]/performance/route.ts` returning the season average, last-10, favorite, underdog, home, and away averages (null for empty splits), and the chronological per-game rows with opponent info, tags, and the game's detail link id; support the `year` query convention used by the team route; verify via manual request for a team with graded games and a team with none

## 6. UI

- [x] 6.1 Add a `performance` entry to `TeamTab` / `TEAM_TABS` in `src/app/teams/[teamId]/page.tsx` and render the summary card with the season label and splits, including the unavailable state for empty splits and the no-data message for a team with no graded games; verify against dev data and against a team with none
- [x] 6.2 Add the per-game cover-margin chart (positive/negative visually distinct, chronological) and the per-game list (date, opponent, home/away, spread, result, cover margin, label, tags, link to game detail) to the Performance tab; verify with a favorite-underperformed game, an underdog-lost-close game, and a game with several tags
- [x] 6.3 Add the league leaderboard section to `src/app/teams/page.tsx` above the conference grid, linking each row to `/teams/[id]?tab=performance`, with the no-data message when empty; verify ordering against the API response and the link opening the Performance tab

## 7. Integration verification

- [x] 7.1 Run the new ingest end to end against the dev database and compare three games' persisted cover margins by hand against their spread and final score
- [x] 7.2 Confirm the leaderboard average for one team matches the average of that team's per-game rows on its Performance tab
- [x] 7.3 Verify desktop and mobile layouts of the new tab and leaderboard, and light and dark themes
- [x] 7.4 Run `npx tsc --noEmit`, the lint script, and the unit tests; fix any failures
- [x] 7.5 Run `openspec validate add-team-performance-vs-expectation` and fix any reported issues
