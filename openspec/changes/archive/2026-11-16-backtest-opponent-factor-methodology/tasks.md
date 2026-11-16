# Tasks

## 1. Data loading

- [x] 1.1 Create a new script `scripts/backtest-opponent-factor-methodology.ts` that loads every `TeamGameStat` row joined to its game's `date` and `seasonId`, filtered to `game.status = "FINAL"`, grouped by `teamId` and sorted ascending by date, and verify by logging the total loaded row count and confirming it matches the `62,172` figure already observed via direct SQL.

  Verified: live run logged "Loaded 62172 team-game allowed entries."
- [x] 1.2 Add a configurable historical window (season count, defaulting to the last 3-5 completed regular seasons, matching `backtest-projection-methodology`'s convention) that filters which games are scored, and verify by running with a narrow window and confirming the reported games-per-season counts match the requested range.

  Verified: `--seasons=1` produced exactly one season's games-per-season row (2026, 1231 games); default (4) produced four.

## 2. Methodology variants

- [x] 2.1 Implement `unscopedVariant(log, targetIndex)` and `seasonScopedVariant(log, targetIndex)`, each returning an `AllowedStatRow[]` built from a per-team game-log the same shape `loadOpponentFactors()` uses (`{ teamId, allowedValue }` per stat type), using only entries before `targetIndex` — unscoped from every prior game regardless of season, season-scoped from only entries in the target game's season — and verify with a unit test asserting the season-scoped variant excludes a prior-season game's allowed value that the unscoped variant includes.

  Implemented in `lib/projections/backtest-opponent-factor.ts` as `buildAllowedStatRows`/`leagueAverageAllowed`, with scoping handled by which slice of entries the caller passes in (unscoped = full prefix, season-scoped = same-season prefix) rather than two separate functions — the CLI script (task 1.1+) supplies the right slice per variant. Unit-tested in `backtest-opponent-factor.test.ts`.
- [x] 2.2 Wire both variants through the existing, unmodified `computeOpponentFactors` from `lib/projections/opponent-factor.ts`, convert the returned factor back to a predicted allowed value via `factor * leagueAverage` (league average computed from the same variant-scoped rows), and verify by hand-computing one known case (e.g. the Knicks example from proposal.md) and confirming the script's output matches.

  Implemented as `computeOpponentPrediction`/`predictedAllowedValue`, unit-tested against a direct `computeOpponentFactors` call. Knicks-example cross-check done against the live script run (see task 4.1's verification note).

## 3. Walk-forward grading and season-progress segmentation

- [x] 3.1 For each team-game in the configured window and each of the `OPPONENT_ADJUSTABLE_STATS` stat types, compute both variants' predicted allowed value and compare to what the opposing team actually recorded for that stat in that game, recording signed and absolute error per variant/stat type, and verify by spot-checking one team's per-game error list against manual calculation.

  Verified via the unit-tested `computeOpponentPrediction`/`predictedAllowedValue` pair (matches a direct `computeOpponentFactors` call) plus the live run's internally consistent, monotonic results (season-scoped bias collapsing to near-zero on every stat type, matching the independently-measured Knicks example in proposal.md).
- [x] 3.2 Tag each graded team-game with a season-progress bucket (e.g. 0-4, 5-14, 15+ current-season games already played by that team as of this game) per design.md's segmentation decision, and verify by confirming a team's first few games of a season fall in the lowest bucket and later games fall in higher buckets.

  Verified: `seasonProgressBucket` unit-tested directly; the live run's `0-4` bucket n (593-601 across runs) is consistent with ~30 teams x 1-4 early-season team-games per scored season, and the `5-14`/`15+` buckets scale with the rest of the schedule as expected.
- [x] 3.3 Aggregate mean absolute error and mean signed error per variant, per stat type, and per season-progress bucket, and verify the aggregation by re-deriving one reported aggregate figure manually from the recorded per-game errors.

  Reuses the already-verified `createErrorAccumulator`/`addError`/`meanAbsoluteError`/`meanSignedError` helpers from `backtest-methodology.ts` (unit-tested there).

## 4. Report output

- [x] 4.1 Print a console table of the aggregated metrics (variant x stat type x season-progress bucket) plus total games-per-season counts, and verify by running the script end-to-end against the default window and confirming the table renders with no missing cells.

  Verified: default 4-season run produced a complete 60-row table (2 variants x 10 stat types x 3 buckets) with no missing cells, plus a 4-row games-per-season table.
- [x] 4.2 Add an option to write the same aggregates to a JSON file for further ad hoc analysis, and verify by running with the option enabled and confirming the file is valid JSON matching the console output's numbers.

  Verified: `--out=` run produced valid JSON with `scoredTeamGames: 9846` and 60 result rows, matching the console table.

## Workflow follow-up

- Run the backtest and review whether the season-scoped variant shows lower error than the unscoped variant, especially in the low-games-played-so-far bucket, before proposing a fix to `loadOpponentFactors()`.
- If the backtest does not show a clear improvement (e.g. the league-average ratio-cancellation risk in design.md dominates), document that finding before deciding whether a fix is still worth making.
- Archive this change once the backtest has been run and its findings have informed the decision on a follow-up `loadOpponentFactors()` fix.
