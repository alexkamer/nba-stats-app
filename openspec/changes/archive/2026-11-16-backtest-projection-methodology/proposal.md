# Proposal

## Why

The `fix-player-projection-season-scope` change proposes scoping a player's "season average" input to the current season instead of their full career history, based on one concrete example (Andre Drummond) and three days of live Best Bets results. Before changing production projection code on that basis alone, we want to validate the hypothesis against a much larger, already-available sample: the database holds player game logs back to 2012, which is enough to directly measure, for many players across many seasons, whether a season-scoped average actually predicts a player's next-game stat value better than an unscoped (career) average — without needing market odds at all, since this compares projected value to the player's own actual recorded stat, not to a betting line. Market odds (`PlayerPropOdds`) only exist for the current 2026-27 season, so this gives us a validation path that works across all of history instead of being limited to the ~3 weeks of data the live incident is based on.

## What Changes

- Add a reusable backtesting tool that, for a given historical date range and set of players, walks forward game-by-game and computes what a projection methodology *would have* produced using only data available as of that game (no look-ahead), then compares it to the player's actual recorded stat for that game.
- Support running this with at least two methodology variants side by side — the current unscoped "season average" (career-to-date) and the proposed season-scoped one — over the same historical games, so their prediction error can be compared directly.
- Report aggregate error metrics (e.g. mean absolute error, signed bias) per variant, and break them out by player tenure (players with prior-season history on record vs. players in their first tracked season) so the comparison targets exactly the population the bug affects.
- This is a standalone analysis tool, not a change to the live projection pipeline (`ingest/generate-projections.ts`) or any user-facing surface. Its output informs whether and how `fix-player-projection-season-scope` proceeds, but ships independently.

## Capabilities

### New Capabilities
- `projection-methodology-backtesting`: lets a projection methodology variant be evaluated against historical actual results across past seasons, without requiring market odds, so methodology changes can be validated before they're shipped to the live pipeline.

## Impact

- New standalone script/tool (no existing production code path is modified).
- Reads existing `PlayerGameStat`, `Game`, `Season`, and `Player` tables; does not read or require `PlayerPropOdds`.
- Depends on `lib/projections/player-prop-projection.ts`'s `projectPlayerStat` and `lib/projections/extract-prop-stat.ts`'s `extractStatValue` being reusable as pure functions outside the live ingest pipeline (they already are — no changes needed there).
- Output is a report (console/file), not a persisted database table; no schema change.
