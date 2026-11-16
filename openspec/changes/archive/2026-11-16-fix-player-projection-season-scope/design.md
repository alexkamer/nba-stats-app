# Design

## Context

`ingest/generate-projections.ts` has two player game-log loaders:

- `loadPlayerGameLog(playerId)` (line ~426) — no season filter, returns every `FINAL` game on record for the player. Used by `generatePlayerPropProjections()` and `projectKingOfTheCourtCandidate()` to build `seasonAverage` and the `recentValues`/`recentMinutes` slices.
- `loadPlayerSeasonGameLog(playerId, seasonId)` (line ~483) — already filters by `seasonId`, with its own cache keyed by `(playerId, seasonId)`. Used only by `computeTeammateMultiplier()` for the teammate-role adjustment.

Both the recency slice (`values.slice(-RECENT_GAMES_WINDOW)`) and the season average (`values.reduce(...) / values.length`) are currently derived from the same unscoped array. The recency slice happens to be correct in practice today, because the current season's games are always the most recent ones chronologically — but the season average is not, since it silently includes every prior season's games. See proposal.md - Why for the Drummond example and the losing-streak evidence.

`PlayerPropProjection.method` already carries a version tag (`"v2-availability-aware"`) used to segment accuracy by methodology (`lib/accuracy/compute-accuracy.ts`'s `accuracyByMethod`). Rows are frozen at creation and never recomputed or backfilled (see `prisma/schema.prisma` comments and design.md from `add-betting-insights-page`).

## Goals / Non-Goals

**Goals:**
- Make the season-average input to `projectPlayerStat` reflect only the player's current-season games, for both player-prop and King of the Court projections.
- Keep the fix isolated to the game-log loading step; no change to the blend weights, minutes-trend logic, or opponent/teammate adjustments.
- Preserve the ability to distinguish projections made under the old (unscoped) methodology from the new (season-scoped) one in accuracy breakdowns.

**Non-Goals:**
- Not retroactively recomputing or backfilling any already-persisted `PlayerPropProjection`, `DailyBestBet`, `DailyBestBetCurrent`, or `KingOfTheCourtEntry` row — these are frozen by existing design and stay as-is.
- Not changing how `recentValues`/`recentMinutes` windows are selected (already correct).
- Not changing the teammate-role-adjustment path (`computeTeammateMultiplier`), which already uses the correctly-scoped `loadPlayerSeasonGameLog`.
- Not addressing the separate, already-documented look-ahead bias in the residual-stdev backtest (`computeResidualStdevs`) — that's an intentional, unrelated design choice.

## Decisions

**Reuse `loadPlayerSeasonGameLog(playerId, seasonId)` in place of `loadPlayerGameLog(playerId)`** at both of its current call sites (`generatePlayerPropProjections()`, `projectKingOfTheCourtCandidate()`), rather than adding a new third loader or retrofitting a season filter onto the existing unscoped function.
- *Why*: the season-scoped loader already exists, is already tested implicitly via the teammate-adjustment path, and keeps exactly one way to load a player's season-scoped game log. Each call site already has `representative.game.seasonId` (prop path) or `game.seasonId` (KOTC path) available, so no new data needs to be threaded through.
- *Alternative considered*: add a `seasonId` parameter to `loadPlayerGameLog` itself and filter there. Rejected because it leaves two near-duplicate loaders differing only by a parameter, inviting the same bug again if a future call site forgets to pass it; collapsing to one loader removes that failure mode entirely.
- **Correction found during implementation**: `loadPlayerGameLog` has a third caller, `loadUnavailableScorers()` (used by `generateGameProjections()`), that this design didn't originally account for. It only reads the recency slice (`recentPoints`), never `seasonAverage`, so it isn't affected by this bug. `loadPlayerGameLog` and `playerGameLogCache` are therefore kept in place for that one caller instead of being deleted — the "delete once both call sites are switched" plan assumed exactly two call sites, and there are three.

**Bump `PROP_METHOD` (and the King of the Court equivalent, if it carries its own tag) to a new version string** when this ships, rather than keeping the existing `"v2-availability-aware"` tag.
- *Why*: `accuracyByMethod` already exists specifically to let methodology changes be compared before/after; projections computed under the career-average bug are a materially different methodology from season-scoped ones, and silently mixing them under one tag would hide exactly the kind of regression this change is fixing from future analysis.
- *Alternative considered*: leave the tag unchanged since the fix is "obviously correct." Rejected — the whole reason `method` exists as a column is to avoid relying on "obviously correct" when grading history; a new tag costs nothing and preserves the ability to verify the fix worked by comparing accuracy across the boundary.

**No backfill or correction of historical rows.**
- *Why*: consistent with the existing frozen-projection design (`PlayerPropProjection` rows are never recomputed once written) and with how past `DailyBestBet` picks are already treated as historical record, not a live view. Recomputing history retroactively would also rewrite already-published accuracy numbers users may have already seen.

## Risks / Trade-offs

- [Risk] A player with zero games in the current season (e.g., a rookie whose debut is the game being projected, or very early in a new season before anyone has a current-season game log) now has no fallback to prior-season history, where today's unscoped query would have at least returned something. → Mitigation: this is already handled by the existing "Insufficient data handling" requirement in `betting-projections` — `projectPlayerStat` returns `null` when both `seasonAverage` and `recentValues` are empty, and the pipeline already skips producing a projection in that case (`if (projectedValue === null) continue;`). No new code path is needed; this just means that existing, already-specified behavior now triggers correctly for a case it previously masked with stale career data.
- [Risk] Switching to `loadPlayerSeasonGameLog`'s cache key (`playerId + seasonId`) instead of `loadPlayerGameLog`'s (`playerId` only) means a player projected across two different seasons within the same run would no longer share a cache entry. → Mitigation: a single `generate-projections.ts` run only ever projects games for one scheduled date, which belongs to exactly one season, so this has no practical effect; noted only for completeness.
- [Risk] Changing `PROP_METHOD` means the accuracy page's `byMethod` breakdown will show the old tag's history as a closed-out bucket and start a fresh one. → Mitigation: this is the intended, pre-existing purpose of the `method` column; no display changes are needed, and overall (non-method-segmented) accuracy stats are unaffected.

## Migration Plan

1. Ship the loader swap and method-tag bump together in one deploy — there's no intermediate state to support.
2. No database migration required (no schema change).
3. Next scheduled run of `ingest/run-all-sync.ts` picks up the fix automatically for any newly-scheduled games; already-persisted projections for already-scheduled-but-not-yet-played games are unaffected (they were already frozen at creation and won't be regenerated).
4. Rollback is a plain revert of the code change; no data cleanup is needed since no historical rows are touched either direction.
