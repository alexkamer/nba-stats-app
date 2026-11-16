# Proposal

## Why

`backtest-opponent-factor-methodology` validated, with real historical data, that `loadOpponentFactors()` in `ingest/generate-projections.ts` has the same bug class `fix-player-projection-season-scope` already fixed for player season averages: it queries every `TeamGameStat` row ever recorded (`TeamGameStat` goes back to 2002) with no season filter, then feeds that into `computeOpponentFactors()` to compute each team's "how much more/less than league average does this team allow" multiplier. The backtest measured a large, consistent bias in the current unscoped approach across 9,846 scored team-games over the last 4 completed regular seasons — e.g. `POINTS` bias of -11 to -15 (systematically under-predicting how much a team allows) vs. -0.1 to +0.7 for a season-scoped computation, on every stat type and every season-progress bucket. The root cause is the league's scoring pace shifting roughly 10 points/team-game since 2002; blending that era's lower pace into "league average" and "team allowed average" skews every opponent factor low. `opponentFactorsByStat` feeds both player-prop projections and the King of the Court leaderboard (not game-level projections, which use the separately and already correctly season-scoped `team-rating.ts` solve), so this affects every prop pick's opponent adjustment.

## What Changes

- Scope `loadOpponentFactors()`'s input query to the current season only, so `computeOpponentFactors()` never sees prior-season `TeamGameStat` rows.
- No change to `computeOpponentFactors()` itself (already pure, already has the right fallback/clamp behavior) or to how its output is consumed by `generatePlayerPropProjections()`/`generateKingOfTheCourtLeaderboard()`.
- Already-persisted `PlayerPropProjection`, `DailyBestBet`, and `KingOfTheCourtEntry` rows are frozen by design and are not retroactively recomputed; this only affects projections generated after the fix ships.

## Capabilities

### Modified Capabilities
- `betting-projections`: the "Player prop projection" requirement's opponent-adjustment input must be scoped to the current season, not the full cross-season `TeamGameStat` history. This change assumes `fix-player-projection-season-scope` has already landed — that change's wording ("current-season averages") is the baseline this proposal's spec delta builds on, since both touch the same requirement.

## Impact

- `ingest/generate-projections.ts`: `loadOpponentFactors()` is the function at fault. It's currently computed *once* in `main()`, with no `seasonId` input, and the resulting map is threaded as a shared parameter into both `generatePlayerPropProjections()` and `generateKingOfTheCourtLeaderboard()`/`projectKingOfTheCourtCandidate()` — unlike the per-game-log fix, there's no single `seasonId` available at the point it's currently called. Fixing it means either computing one map per distinct season present among today's scheduled games, or converting it to a lazily-computed, per-season-cached loader (matching the existing `loadPlayerSeasonGameLog(playerId, seasonId)` pattern already used elsewhere in this file) called at each per-game/per-candidate site instead of being precomputed once and passed down. The exact shape is a design decision for design.md, not finalized here.
- `lib/projections/opponent-factor.ts`: no code change — `computeOpponentFactors()` stays as-is.
- King of the Court leaderboard projections inherit the fix automatically, same as the player-average fix, since they share whatever `loadOpponentFactors()` produces.
- No database migration needed; no change to frozen historical rows.
- Depends on `fix-player-projection-season-scope` being implemented first (it is — pending archive) since both modify the same `betting-projections` capability's "Player prop projection" requirement.
