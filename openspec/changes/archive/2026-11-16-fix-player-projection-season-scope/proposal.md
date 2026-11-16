# Proposal

## Why

Player prop projections (and the King of the Court leaderboard, which reuses the same methodology) compute a player's "season average" from `loadPlayerGameLog()` in `ingest/generate-projections.ts`, which queries every `FINAL` game on record for that player with no season filter. For any player with multiple seasons of history in the database, this blends in years of prior-season games as if they were this season's average. Andre Drummond's "season average" currently reflects 1,008 games back to 2012 (a 22.66 points+rebounds/game career average from his years as a high-minutes starter) rather than his actual current-season role (~8-10 points+rebounds/game off the bench). Blended at 40% weight against recent form, this inflates his (and other long-tenured veterans') projections well above both their actual recent production and the market line, which has driven several of the highest-edge "Best Bets" picks to lose over 2026-11-13 through 2026-11-15. A sibling function in the same file, `loadPlayerSeasonGameLog(playerId, seasonId)`, already filters correctly by season and is used elsewhere (teammate-role adjustment) — the fix is to scope the season-average/recent-form input the same way everywhere it's computed.

## What Changes

- Scope the game log used to compute a player's season average and recent-form values to the current season only, for both player-prop projections and King of the Court candidate projections.
- Reuse the existing season-scoped log loader (or an equivalent season filter) instead of the unscoped one, so career history never leaks into a "season average."
- No change to recent-form windowing itself (the most recent N games are already correctly recent) — only the season-average input is corrected.
- Already-persisted `PlayerPropProjection`, `DailyBestBet`, and `KingOfTheCourtEntry` rows are frozen by design and are not retroactively recomputed; this only affects projections generated after the fix ships.

## Capabilities

### Modified Capabilities
- `betting-projections`: the "Player prop projection" requirement's season-average input must be scoped to the player's current season, not his full game-log history.

## Impact

- `ingest/generate-projections.ts`: `loadPlayerGameLog()` (used by `generatePlayerPropProjections()` and `projectKingOfTheCourtCandidate()`) is the function at fault.
- `lib/projections/player-prop-projection.ts`: no code change expected, but its `seasonAverage` input contract should be clarified as "current season" explicitly.
- King of the Court leaderboard projections inherit the fix automatically since they share the same log loader and methodology (per the `king-of-the-court-prediction` spec's "same projection methodology" requirement) — no separate spec delta needed there.
- No database migration needed; no change to frozen historical rows.

## Follow-up findings from the task 4.1 regression sweep (not fixed in this change)

Two additional unscoped-history call sites were found while implementing this change. Neither is fixed here — scope stays limited to the two call sites above — but both are recorded so they aren't lost:

- **`loadUnavailableScorers()` (`ingest/generate-projections.ts`, used by `generateGameProjections()`) is a third caller of `loadPlayerGameLog()`** that the original proposal/design didn't account for. It only reads the recency slice (`recentPoints`), never `seasonAverage`, so it isn't affected by this change's bug — but it does mean `loadPlayerGameLog()` can't be deleted outright as task 1.3 originally assumed; it stays in place solely for this caller.
- **`loadOpponentFactors()` (`ingest/generate-projections.ts`) has no season filter either**, and feeds `opponentFactorsByStat`, which every game and player-prop projection uses. `TeamGameStat` data goes back to 2002. Measured example: the Knicks' opponent factor comes out to `0.914` computed season-scoped vs. `1.004` computed unscoped (career) — a ~9-point swing, well inside the code's `[0.85, 1.15]` clamp, so it's large enough to flip a projection's lean. This is the same bug class as the one this change fixes, but with a larger blast radius (every projection, not just long-career players) and a different mechanism (team-level opponent strength, not player season averages). It warrants its own proposal, spec delta, design, and backtest-style validation rather than being folded into this change's scope.
