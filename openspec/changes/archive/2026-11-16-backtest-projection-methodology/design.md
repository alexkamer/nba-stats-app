# Design

## Context

`lib/projections/player-prop-projection.ts`'s `projectPlayerStat({ seasonAverage, recentValues, recentMinutes, opponentFactor })` and `lib/projections/extract-prop-stat.ts`'s `extractStatValue(statType, row)` are already pure functions with no database or ingest-pipeline dependency — they're reusable as-is outside `ingest/generate-projections.ts`. The only thing that differs between "live" and "backtest" is how `seasonAverage`/`recentValues`/`recentMinutes` get built from a player's game history, which is exactly the variable this backtest needs to swap between methodology variants. See proposal.md - Why for why this is being done before `fix-player-projection-season-scope` touches production code.

The DB holds `PlayerGameStat` back to 2012 (1,008+ games for some long-career players) but `PlayerPropOdds` only since the 2026-27 season, so this tool is designed to need nothing but `PlayerGameStat`, `Game`, `Season`, and `Player`.

## Goals / Non-Goals

**Goals:**
- Measure, across as much history as is available, whether a season-scoped "season average" produces lower prediction error than the current unscoped one, without touching live tables.
- Make it easy to add a third/fourth variant later (e.g. a different blend weight) without rewriting the walk-forward machinery.
- Segment results by player tenure so the comparison isolates the population the bug actually affects.

**Non-Goals:**
- Not reproducing the opponent-factor or teammate-role-adjustment layers — this backtest isolates the season-average question specifically. Opponent factor is held neutral (1) and teammate-role adjustment is omitted for every variant, so any error difference between variants is attributable only to the season-average input, not to confounding adjustments.
- Not grading against market lines or computing edge ratios, win rate, or P/L — proposal.md already established odds don't exist for historical seasons. This tool measures raw projection error against the actual stat value only.
- Not covering `DOUBLE_DOUBLE`/`TRIPLE_DOUBLE` prop types — these are binary flags where mean-absolute-error isn't a meaningful metric; backtesting them would need a different metric (e.g. Brier score) and is left for a future change if needed.
- Not a scheduled or production job — this is a one-off/rerunnable analysis script, not added to `ingest/run-all-sync.ts`.

## Decisions

**Preload each player's full chronological game log once, then walk forward by array index rather than issuing one query per historical game.**
- *Why*: a meaningful backtest sample is thousands of player-games; querying per-game would be extremely slow and is unnecessary since each player's log is already small enough to hold in memory (even Drummond's 1,008-game career log is trivial). Load once per player: `{ gameId, date, seasonId, points, rebounds, assists, threeMade, steals, blocks, minutes }[]`, sorted ascending by date; for the game at index `i`, variants only ever see indices `< i`.
- *Alternative considered*: reuse `ingest/generate-projections.ts`'s existing per-game-triggered query pattern. Rejected — that pattern issues a query per player per live run, which is fine for one scheduled date's worth of games but would mean thousands of redundant queries across a multi-season backtest.

**Model each methodology as a pure function `(log, targetIndex) => { seasonAverage, recentValues, recentMinutes }`, then feed its output into the existing `projectPlayerStat`.**
- *Why*: keeps `projectPlayerStat` itself untouched (consistent with proposal.md's Impact statement that no production code changes), and makes adding a new variant a matter of writing one new small function, not restructuring the harness. Two variants ship with this change:
  - `unscopedVariant`: `seasonAverage` from every log entry at index `< targetIndex` (today's buggy behavior) — `recentValues`/`recentMinutes` from the same unscoped log, sliced to the last 10 (matches today's actual recency behavior, which is already correct).
  - `seasonScopedVariant`: identical except `seasonAverage` is computed only from log entries at index `< targetIndex` whose `seasonId` matches the target game's `seasonId`.
- *Alternative considered*: literally import and call `generatePlayerPropProjections()`'s internals. Rejected — that function is tightly coupled to today's date, `PlayerPropOdds` rows, and live availability state; extracting just the averaging logic into small standalone functions is simpler and keeps the backtest decoupled from ingest-pipeline shape changes.

**Define "tenure" per player-game as "has at least one game log entry from a `seasonId` earlier than the target game's `seasonId`."**
- *Why*: directly matches what the bug depends on (career history bleeding into season average) rather than a proxy like age or minutes.

**Report format: a single script run producing a console table (and optionally a written JSON file) with aggregate MAE/signed-bias per variant, per stat type, per tenure group — no new database table.**
- *Why*: this is a one-off validation exercise per the spec's "no effect on live pipeline or persisted data" requirement; a throwaway report is sufficient and keeps this change's footprint small.

## Risks / Trade-offs

- [Risk] Early seasons in the data (2012-era) may have sparser or differently-shaped box scores (e.g. missing `minutes`) than recent seasons, which could skew error metrics for reasons unrelated to the methodology question. → Mitigation: default the backtest's date range to a configurable recent window (e.g. the last 3-5 completed seasons) rather than the full 2012+ history, with the option to widen it; report the games-per-season count alongside error metrics so a skewed sample is visible rather than hidden.
- [Risk] A player who changes teams mid-season or between seasons could show a legitimate role change that looks identical, from this data alone, to the kind of decline the fix targets — the backtest can't distinguish "role genuinely changed" from "random variance" using box scores alone. → Mitigation: not fully solvable with this data; mitigated by aggregating over many players and games rather than relying on single-player anecdotes (unlike the Drummond example that motivated this), and by reporting tenure-segmented aggregates rather than conclusions about any one player.
- [Risk] Results could show the season-scoped variant is *not* clearly better in aggregate (e.g. early-season small-sample noise cancels out the win), which would undercut `fix-player-projection-season-scope`'s rationale. → Mitigation: this is the point of validating first — if that happens, report it plainly rather than cherry-picking a favorable slice, and revisit the fix's approach before implementing it.

## Open Questions

- Default historical window to backtest (e.g. last 3 seasons vs. all available since 2012) — can be left as a script argument with a sensible default rather than decided now, since it doesn't change the approach or task breakdown.
