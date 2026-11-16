# Tasks

## 1. Data loading

- [x] 1.1 Create a new script `scripts/backtest-projection-methodology.ts` that loads, per player, every `PlayerGameStat` row joined to its game's `date` and `seasonId`, filtered to `game.status = "FINAL"` and `points IS NOT NULL`, sorted ascending by date, and verify by logging the loaded game count for a known long-career player (e.g. Andre Drummond, id 338) and confirming it matches the `1,008` figure already observed via direct SQL.
- [x] 1.2 Add a configurable historical window (season count or explicit season-id range, defaulting to the last 3-5 completed seasons per design.md's Risks section) that filters which games are scored (not which games are visible as input history), and verify by running with a narrow window and confirming the reported games-per-season counts match the requested range.

## 2. Methodology variants

- [x] 2.1 Implement `unscopedVariant(log, targetIndex)` returning `{ seasonAverage, recentValues, recentMinutes }` computed from all log entries before `targetIndex` regardless of season, matching today's `loadPlayerGameLog` behavior, and verify with a unit test asserting it returns a non-null average for a player with only prior-season games.
- [x] 2.2 Implement `seasonScopedVariant(log, targetIndex)` identical to 2.1 except `seasonAverage` only includes entries before `targetIndex` whose `seasonId` matches the target game's `seasonId`, and verify with a unit test asserting it returns `null` (or omits the player) for a target game that is a player's first game logged in that season with no other current-season games yet.
- [x] 2.3 Wire both variants through the existing `extractStatValue` (per `PropStatType`, excluding `DOUBLE_DOUBLE`/`TRIPLE_DOUBLE` per design.md's non-goals) and `projectPlayerStat` with `opponentFactor` held at `1` for every call, and verify by projecting one known historical game by hand and confirming the script's output matches a manually computed value.

## 3. Walk-forward grading and tenure segmentation

- [x] 3.1 For each player-game in the configured window, compute both variants' projected value for every applicable `PropStatType`, compare each to `extractStatValue(statType, actualRow)` for that same game, and record signed error and absolute error per variant/stat type, and verify by spot-checking one player's full per-game error list against manual calculation.
- [x] 3.2 Tag each graded player-game as "veteran" (has at least one prior-season log entry) or "first-tracked-season" per design.md's tenure definition, and verify by confirming a rookie's games are never tagged "veteran" and a multi-season player's games from their second tracked season onward are tagged "veteran."
- [x] 3.3 Aggregate mean absolute error and mean signed error per variant, per stat type, and per tenure group, and verify the aggregation by re-deriving one reported aggregate figure manually from the recorded per-game errors.

## 4. Report output

- [x] 4.1 Print a console table of the aggregated metrics (variant x stat type x tenure group) plus total games-per-season counts, and verify by running the script end-to-end against the default window and confirming the table renders with no missing cells.
- [x] 4.2 Add an option to write the same aggregates (and optionally per-game detail) to a JSON file for further ad hoc analysis, and verify by running with the option enabled and confirming the file is valid JSON matching the console output's numbers.

## Workflow follow-up

- Run the backtest and review whether the season-scoped variant shows lower error than the unscoped variant, especially for the "veteran" tenure group, before proceeding with `fix-player-projection-season-scope`'s implementation.
- If the backtest does not support the hypothesis, revisit `fix-player-projection-season-scope`'s proposal/design before implementing it.
- Archive this change once the backtest has been run and its findings have informed the decision on `fix-player-projection-season-scope`.
