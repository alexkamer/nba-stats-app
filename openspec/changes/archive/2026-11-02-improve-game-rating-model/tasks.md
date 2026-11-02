# Tasks

## 1. League-wide team rating module

- [x] 1.1 Add `lib/projections/team-rating.ts`: given a flat list of team games (`{ teamId, opponentId, pointsFor, pointsAgainst }`), solve offensive/defensive ratings via fixed-point iteration (design.md "Rating methodology" — converge at <0.05 pt change, cap 20 iterations), returning `Map<teamId, { offRating: number; defRating: number }>`; verify unit tests cover: a team that beats weak opponents by a lot rates lower than a team that beats strong opponents by a little despite a worse raw point differential, the solve converges within the iteration cap on a small synthetic league, and an empty/single-team input returns gracefully without dividing by zero.
- [x] 1.2 Add a league-wide game-count threshold check to the same module (or a sibling helper) that reports whether a given game list has enough games to make the solve meaningful (design.md "Graceful degradation" — e.g. fewer than 20 total games); verify a unit test confirms the threshold flips at the documented boundary.

## 2. Game projection: rating-based offense/defense

- [x] 2.1 Update `lib/projections/game-projection.ts`'s inputs/formula to use rating-based offense/defense (plus league average) instead of raw blended PPG, preserving the existing `unavailableScorers` adjustment call site, `TeamProjectionInput`/`GameProjectionResult` shapes, and home-court `edge` calculation unchanged (design.md "Projected score: same output shape"); verify `lib/projections/game-projection.test.ts` is updated so its existing scenarios (lopsided margin, near-even margin, unavailable top scorer lowers offense, deep-bench player ignored, null on no history) still pass against the new formula, plus a new test demonstrating a team's projection shifts when its opponent-adjusted rating differs from what raw PPG alone would suggest.
- [x] 2.2 Implement the recent-window/season blend and graceful-degradation fallback (design.md: 60/40 blend of two independently-converged rating windows; below the per-team ≥3-game bar or the league-wide game-count threshold from 1.2, fall back to the existing unadjusted recency/season PPG blend for that team); verify a unit test confirms the fallback path produces the same result as today's pre-change `blend()` output when the threshold isn't met.

## 3. Wire the rating solve into the generation pipeline

- [x] 3.1 Update `ingest/generate-projections.ts` to load every team's recent-window and season game list once per run (not per game), compute both rating maps via the module from task 1, and pass the relevant teams' ratings into `generateGameProjections`/`projectGame`; verify running `generate-projections.ts` against the dev DB produces projections for all currently-projectable scheduled games without error, and that a spot-checked game's projected margin changes from its pre-change value in a direction consistent with the two teams' actual opponent strength (e.g. a team that beat only bad teams projects lower than its raw PPG alone would suggest).
- [x] 3.2 Replace the `marginStdev`/`totalStdev` calculation with the residual-based approach (design.md "Residual-based stdev": stdev of actual-minus-rating-projected margin/total over the league's last ~60-90 completed games, using current ratings); verify by running against the dev DB and confirming the resulting `spreadBettable`/`totalBettable` rates across all `GameProjection` rows are higher than the pre-change baseline (5/52 spread, 2/52 total) without producing an obviously degenerate (near-zero or absurdly large) stdev.
- [x] 3.3 Bump the persisted `method` tag (e.g. `v2-opponent-rating`) on newly created `GameProjection` rows so old and new methodology projections are distinguishable in later analysis; verify a query against the dev DB shows the new tag on projections created after this change ships and the old tag unchanged on existing rows.

## 4. Market-favorite accuracy baseline

- [x] 4.1 Add `gradeMarketFavorite(marketMarginAtPick, actualHomeScore, actualAwayScore)` to `lib/accuracy/grade-game.ts`, mirroring `gradeGameProjection`'s sign-comparison shape (design.md "Market-favorite accuracy baseline"); verify `lib/accuracy/grade-game.test.ts` covers a correct pick, an incorrect pick, and a `null`-equivalent/neutral case when `marketMarginAtPick` is `null`.
- [x] 4.2 Wire a `marketFavorite` accuracy summary into `/api/betting/accuracy` (`src/app/api/betting/accuracy/route.ts`), computed live from existing `GameProjection.marketMarginAtPick` and each game's final score, alongside the existing `ourModel`/`espnPredictor` summaries; verify a manual request against dev data returns a `marketFavorite` hit-rate figure computed only over graded games that have a non-null `marketMarginAtPick`.

## 5. Integration verification

- [x] 5.1 Run `ingest/run-all-sync.ts` end-to-end against the dev database and confirm the full pipeline (odds -> availability -> projections -> grading) completes without error, new `GameProjection` rows carry the `v2-opponent-rating` method tag, and the unavailable-scorer adjustment from `add-player-availability-signal` is still visibly reducing offense for a team missing a qualifying scorer (same manual check pattern as that change's own task 4.2).
- [x] 5.2 Run the full test suite and confirm all new and existing tests pass, with no regression in `lib/projections/*.test.ts` or `lib/accuracy/*.test.ts`.

## Workflow follow-up

- Archive this change once implementation and verification above are complete and reviewed.
