# Tasks

## 1. Data model

- [x] 1.1 Add `KingOfTheCourtLeaderboard` (`date DateTime @unique`) and `KingOfTheCourtEntry` (`leaderboardId`, `playerId`, `projectedValue Float`, `rank Int`, graded columns `gradedAt DateTime?`, `gradedHit Boolean?`) models to `prisma/schema.prisma`, mirroring the `DailyStatLeader`/`DailyStatLeaderEntry` shape, and verify `npx prisma validate` passes.
- [x] 1.2 Generate and apply the migration (`npx prisma migrate dev --name add_king_of_the_court_leaderboard`) and verify the new tables exist via `npx prisma studio` or a `\d` check against the dev DB.

## 2. Leaderboard generation

- [x] 2.1 In `lib/projections/` (or a new sibling test file), add a pure helper that ranks a list of `{ playerId, projectedValue }` candidates descending by `projectedValue` and assigns `rank` (ties at the same value share a rank), and verify with a unit test covering an outright top value and a tied-top-value case.
- [x] 2.2 In `ingest/generate-projections.ts`, add `generateKingOfTheCourtLeaderboard(availabilityByGamePlayer)`: for each date with a scheduled game that has no existing `KingOfTheCourtLeaderboard` row, iterate every rostered, non-OUT player on a team in one of that date's scheduled games, compute their projected `POINTS_REBOUNDS_ASSISTS` value via the existing `loadPlayerGameLog`, `loadOpponentFactors`, `computeTeammateMultiplier`, and `projectPlayerStat` helpers (already defined in this file), skip players with a `null` projection, and persist the ranked leaderboard via 2.1's helper. Verify by running the script against seeded dev data and confirming a `KingOtTheCourtLeaderboard` row appears for today with one entry per eligible player.
- [x] 2.3 Wire the new function into `main()` in `ingest/generate-projections.ts` (after prop projections, reusing the already-loaded `availabilityByGamePlayer`) and update its summary `console.log` line to report leaderboard counts. Verify by re-running the script twice in a row and confirming the second run reports zero newly-created leaderboards (idempotency).
- [x] 2.4 Add a unit test (e.g. `ingest/generate-king-of-the-court.test.ts` or alongside existing `generate-projections` coverage if such a test file exists) asserting: a player with no posted `PlayerPropOdds` row is still included; a player frozen OUT is excluded; a player with no qualifying stat history is omitted rather than defaulted to zero.

## 3. Grading

- [x] 3.1 Add `gradeKingOfTheCourt(topRankedPlayerIds: number[], actualLeaderPlayerIds: number[]): boolean` to `lib/accuracy/` (returns `true` if any top-ranked id is in the actual-leader set), matching the tie-handling in design.md. Verify with a unit test covering a clean hit, a clean miss, and a tie-at-rank-1 where only one of the tied players matches.
- [x] 3.2 In `ingest/grade-predictions.ts`, add a grading pass that finds `KingOfTheCourtLeaderboard` rows with `gradedAt: null` whose date has a corresponding `DailyStatLeader` row, grades the rank-1 entries via 3.1, and writes `gradedAt`/`gradedHit` on those entries. Verify by running the script against a seeded date that already has both a leaderboard and a `DailyStatLeader` row and confirming the entries get graded exactly once (re-running leaves `gradedAt` unchanged).
- [x] 3.3 Add a running accuracy aggregate for King of the Court (hit rate over graded dates) in `lib/accuracy/compute-accuracy.ts` or a new sibling function, consistent with the existing per-source aggregation pattern. Verify with a unit test over a small set of graded/ungraded leaderboards.

## 4. API and `/betting` page

- [x] 4.1 Extend `src/app/api/betting/accuracy/route.ts` to query graded `KingOfTheCourtEntry` rows and include the King of the Court hit rate in the JSON response, alongside the existing game/predictor/prop sources. Verify via a manual `curl` against the dev server showing the new field.
- [x] 4.2 Extend `src/app/api/betting/upcoming/route.ts` (or add a new route if today's leaderboard doesn't fit that route's existing shape) to include today's `KingOfTheCourtLeaderboard` entries, ranked, when one exists for today. Verify via a manual `curl` showing the ranked leaderboard for a seeded today-date.
- [x] 4.3 Add a King of the Court leaderboard section to `src/app/betting/page.tsx`, showing the ranked candidates and their projected values, omitted entirely when no leaderboard exists for today. Verify by loading `/betting` in the dev server with seeded data and visually confirming the section renders, then confirming it's absent when the seeded data has no today-leaderboard.
- [x] 4.4 Add the King of the Court hit rate to the page's existing accuracy scoreboard display. Verify by loading `/betting` with seeded graded King of the Court data and visually confirming the hit rate appears alongside the other sources.

## 5. Integration

- [x] 5.1 Run the full `npx tsx ingest/run-all-sync.ts` against a dev/staging DB end to end and verify it completes without error, with the new leaderboard-generation and grading steps logging alongside the existing ones.
- [x] 5.2 Run the project's existing test suite (`npm test` or equivalent) and verify no regressions in previously-passing tests.
