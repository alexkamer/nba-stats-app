# Tasks

## 1. Convert loadOpponentFactors to a per-season-cached loader

- [x] 1.1 In `ingest/generate-projections.ts`, replace `loadOpponentFactors(): Promise<Map<PropStatType, Map<number, number>>>` with `loadOpponentFactorsForSeason(seasonId: number): Promise<Map<PropStatType, Map<number, number>>>`, adding a `Map<number, Map<PropStatType, Map<number, number>>>` cache keyed by `seasonId` (mirroring `loadPlayerSeasonGameLog`'s cache shape) and adding `seasonId` to the `teamGameStat.findMany` query's `where: { game: { status: "FINAL", seasonId } }`, and verify by running it for two different season ids and confirming each returns a distinct map with different values (not the same cached result).
- [x] 1.2 In `generatePlayerPropProjections`, remove the `opponentFactorsByStat` parameter and replace its use with a call to `loadOpponentFactorsForSeason(representative.game.seasonId)` inside the per-group loop, and verify by running against a team with multiple seasons of `TeamGameStat` history and confirming the resulting opponent factor matches a manual season-scoped calculation (e.g. the Knicks example from `backtest-opponent-factor-methodology`'s proposal.md).
- [x] 1.3 In `projectKingOfTheCourtCandidate`, remove the `opponentFactorsByStat` parameter and replace its use with a call to `loadOpponentFactorsForSeason(game.seasonId)`, and propagate the removal of the now-unused `opponentFactorsByStat` parameter up through `generateKingOfTheCourtLeaderboard` and `loadCandidatesForGame` if either forwards it unused — verify with `grep -rn "opponentFactorsByStat" ingest/generate-projections.ts` that every remaining reference is inside the two call sites above or the new loader itself.
- [x] 1.4 Remove the now-unpaired `loadOpponentFactors()` call in `main()` (both generator functions now fetch their own season-scoped factors internally), and verify by running the project's type checker (`npx tsc --noEmit`) and confirming it passes with no new errors.

## 2. Preserve existing insufficient-data and clamp behavior

- [x] 2.1 Verify that `computeOpponentFactors` is still called unchanged (no new arguments, no changed constants) and that a season with too few `TeamGameStat` rows still falls back to the existing neutral-factor/empty-map behavior rather than a new code path, matching the `betting-projections` spec's "Insufficient data handling" requirement — confirm by reading the diff and noting no changes were made to `lib/projections/opponent-factor.ts`.

  Verified: `git diff lib/projections/opponent-factor.ts` is empty — no changes to that file at all.

## 3. Regression check

- [x] 3.1 Run the full existing test suite (`npx tsx --test` over every `*.test.ts` under `lib/` and `ingest/`) and confirm all tests still pass, since no test file should need to change for this refactor (none directly tests `loadOpponentFactors`, which is private to `ingest/generate-projections.ts` and untested at the unit level — the backtest script already validated the methodology change separately).

  Verified: 183/183 tests pass.

## Workflow follow-up

- Deploy the fix so the next scheduled `ingest/run-all-sync.ts` run picks it up for newly-generated projections.
- After a few days of new projections have graded, compare their win rate against the prior period via the betting accuracy page to confirm the fix improved outcomes, same follow-up posture as `fix-player-projection-season-scope`.
- Archive this change, and `fix-player-projection-season-scope` first if not already archived, once verification is complete.
