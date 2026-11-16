# Design

## Context

`ingest/generate-projections.ts`'s `main()` currently calls `loadOpponentFactors()` exactly once, with no season input, producing a single `Map<PropStatType, Map<number, number>>` that's threaded as a shared parameter into `generatePlayerPropProjections(availabilityByGamePlayer, opponentFactorsByStat)` and `generateKingOfTheCourtLeaderboard(availabilityByGamePlayer, opponentFactorsByStat)` (which forwards it into `projectKingOfTheCourtCandidate`). Both consumers look up a specific team's factor via `opponentFactorsByStat.get(statType)?.get(opponentTeamId) ?? 1`.

This is structurally different from the player-average fix: there, each call site already had a specific `seasonId` in hand (`representative.game.seasonId`, `game.seasonId`) and swapping one loader call for another season-aware one was a local, one-line change. Here, `loadOpponentFactors()` is computed upfront, before any specific game is in scope, so there's no single `seasonId` to filter by at that call site.

The file already has a working pattern for exactly this shape of problem: `loadPlayerSeasonGameLog(playerId, seasonId)` is a per-key-cached, lazily-called loader — called wherever a `seasonId` is actually available, with its own `Map` keyed by `` `${playerId}|${seasonId}` ``, so a season only gets queried once no matter how many times it's needed. `loadTeamRosterIds` and `loadPlayedGameIds` follow the same lazy-cache shape for other per-entity lookups in this file.

## Goals / Non-Goals

**Goals:**
- Scope `loadOpponentFactors`'s underlying `TeamGameStat` query to a single season.
- Preserve exactly one factor-computation code path for a given season — no duplicate queries if the same season is needed by both the prop-projection pass and the King of the Court pass in the same run (normally the same season anyway).
- Keep `computeOpponentFactors()` itself untouched, consistent with `fix-player-projection-season-scope`'s precedent of never touching the already-correct pure averaging function.

**Non-Goals:**
- Not changing game-level projections — they don't consume `opponentFactorsByStat` at all (confirmed: only `generatePlayerPropProjections` and `generateKingOfTheCourtLeaderboard`/`projectKingOfTheCourtCandidate` do; game projections use the separately and already-correctly season-scoped `team-rating.ts` solve).
- Not changing `MIN_GAMES_FOR_FACTOR`, the `[0.85, 1.15]` clamp, or any other constant in `lib/projections/opponent-factor.ts` — the backtest validated the season-scoping fix using those exact values unchanged, so changing them now would invalidate that evidence.
- Not backfilling or recomputing any already-persisted projection row.

## Decisions

**Convert `loadOpponentFactors()` into a per-season-cached, lazily-called loader `loadOpponentFactorsForSeason(seasonId)`, mirroring `loadPlayerSeasonGameLog`'s existing shape, rather than precomputing a per-season map upfront in `main()`.**
- *Why*: this is the smallest change that removes the "no seasonId in scope yet" problem — call sites that already have a `seasonId` (the same ones already threading `representative.game.seasonId` / `game.seasonId` for the player-average fix) just call the new loader directly instead of reading a parameter. `main()` no longer needs to call `loadOpponentFactors()` upfront at all, and the `opponentFactorsByStat` parameter is removed from `generatePlayerPropProjections`, `generateKingOfTheCourtLeaderboard`, and `projectKingOfTheCourtCandidate`.
- *Alternative considered*: precompute a `Map<seasonId, Map<PropStatType, Map<number, number>>>` upfront in `main()` by first querying the distinct `seasonId`s among today's scheduled games, then passing that nested map down. Rejected — it's more code (an extra upfront query plus a nested-map threading change across three function signatures) to achieve exactly what a lazy per-season cache already gives for free, and it reintroduces the "collect every season that might be needed" bookkeeping the lazy approach avoids entirely.
- Internals of the new loader: same shape as `loadOpponentFactors` today, but with `where: { game: { status: "FINAL", seasonId } }` added to the `teamGameStat.findMany` call, keyed in a `Map<number, Map<PropStatType, Map<number, number>>>` cache by `seasonId`.

**Call `loadOpponentFactorsForSeason(representative.game.seasonId)` inside `generatePlayerPropProjections`'s per-group loop, and `loadOpponentFactorsForSeason(game.seasonId)` inside `projectKingOfTheCourtCandidate`, replacing the `opponentFactorsByStat` parameter at both.**
- *Why*: matches exactly how `loadPlayerSeasonGameLog` is already called per-row/per-candidate in the same two functions, for the same reason (the season-scoped resource is only known once a specific game is in hand). The cache means repeated calls within one run for the same season (the common case) cost nothing beyond the first.

## Risks / Trade-offs

- [Risk] A run spanning scheduled games from two different seasons (e.g. the tail of preseason overlapping a season rollover) would now compute two separate opponent-factor sets instead of one shared one — slightly more total work than today's single upfront computation. → Mitigation: this is correct behavior, not a cost to avoid — a game's opponent adjustment should reflect that game's own season, and this scenario is already how `loadPlayerSeasonGameLog` and the game-projection pipeline's `seasonRatingsBySeasonId` already behave for the exact same reason.
- [Risk] Early in a season, few or no `TeamGameStat` rows exist yet for that season, so every team's factor falls back to `MIN_GAMES_FOR_FACTOR`'s neutral `1` and the league average itself may be `null` (no opponent adjustment at all) for a period. → Mitigation: this is the existing, already-specified "Insufficient data handling" behavior in `betting-projections` — `computeOpponentFactors` already returns an empty map when the league average is `null` (verified in `lib/projections/opponent-factor.ts`: `if (leagueAvg === null || leagueAvg === 0) return factors;`), and the backtest's `0-4` games-played bucket already measured this regime directly and found the season-scoped approach still outperforms the unscoped one there (unscoped bias was *worse*, not better, in that bucket).
- [Risk] Removing the `opponentFactorsByStat` parameter changes three function signatures (`generatePlayerPropProjections`, `generateKingOfTheCourtLeaderboard`, `projectKingOfTheCourtCandidate`) and `main()`'s call sites. → Mitigation: no external callers of these functions exist outside this file (confirmed: they're not exported), so this is a contained, mechanical signature change.

## Migration Plan

1. Ship the loader conversion in one deploy — no intermediate state to support.
2. No database migration required (no schema change).
3. Next scheduled run of `ingest/run-all-sync.ts` picks up the fix automatically for any newly-generated projections; already-frozen rows are unaffected.
4. Rollback is a plain revert of the code change; no data cleanup needed either direction.
