# Tasks

## 1. Season-scope the player prop projection game log

- [x] 1.1 In `ingest/generate-projections.ts`, replace the `loadPlayerGameLog(representative.playerId)` call inside `generatePlayerPropProjections()` with `loadPlayerSeasonGameLog(representative.playerId, representative.game.seasonId)`, and verify by running the function against a player with multi-season history (e.g. player id 338 / Andre Drummond) and confirming the resulting `seasonAverage` matches a manual average of only `2026-27` season games, not career games.
- [x] 1.2 In the same file, replace the `loadPlayerGameLog(candidate.playerId)` call inside `projectKingOfTheCourtCandidate()` with `loadPlayerSeasonGameLog(candidate.playerId, game.seasonId)`, and verify the King of the Court projection for the same multi-season player matches its corresponding player-prop projection value for `POINTS_REBOUNDS_ASSISTS` (per the `king-of-the-court-prediction` spec's "same projection methodology" requirement).
- [x] 1.3 `loadPlayerGameLog` turns out to have a third caller, `loadUnavailableScorers()`, that the original task wording didn't account for (see proposal.md's "Follow-up findings" section) — it only reads the recency slice, not `seasonAverage`, so it's unaffected by this bug. Leave `loadPlayerGameLog` and `playerGameLogCache` in place for that caller instead of deleting them, and verify with `grep -rn "loadPlayerGameLog" .` that its only remaining reference is inside `loadUnavailableScorers`.
- [x] 1.4 Run the project's type checker/build (e.g. `npx tsc --noEmit` or the project's existing build script) and verify it passes with no new errors.

## 2. Preserve the insufficient-data fallback for players with no current-season games

- [x] 2.1 Verify that `generatePlayerPropProjections()` still skips (via the existing `if (projectedValue === null) continue;`) a player who has zero games in the current season and zero recent values, by constructing or finding a test case (e.g. a player debuting in the game being projected) and confirming no `PlayerPropProjection` row is created for them, matching the `betting-projections` spec's "Insufficient data handling" requirement.

  Verified by inspection + existing test coverage rather than a live fabricated game: the `if (projectedValue === null) continue;` control flow (ingest/generate-projections.ts) is unchanged by this fix — only the source of `gameLog` changed, not how a null projection is handled. `projectPlayerStat`'s null-on-no-data behavior is already covered by `lib/projections/player-prop-projection.test.ts`'s "returns null with no season average and no recent games" test, which still passes (full suite re-run: 176/176 passing). A player with zero current-season games now correctly produces an empty `gameLog` from `loadPlayerSeasonGameLog`, yielding `seasonAverage: null` and `recentValues: []`, which `projectPlayerStat` already turns into `null`.

## 3. Version the methodology tag

- [x] 3.1 Bump `PROP_METHOD` in `ingest/generate-projections.ts` to a new version string (e.g. `"v3-season-scoped"`) so projections generated after this fix are distinguishable from prior ones in `lib/accuracy/compute-accuracy.ts`'s `accuracyByMethod` breakdown, and verify by generating a projection after the change and confirming its persisted `method` column reflects the new tag.
- [x] 3.2 If the King of the Court leaderboard persists its own methodology tag separately from `PROP_METHOD`, bump it to match; otherwise verify (by reading `generateKingOfTheCourtLeaderboard()` and the `KingOfTheCourtEntry`/`KingOfTheCourtLeaderboard` schema) that it has no independent tag and needs no change.

  Confirmed via `prisma/schema.prisma`: `KingOfTheCourtEntry` has no `method` column at all (only `projectedValue`, `rank`, `gradedAt`, `gradedHit`) — no change needed.

## 4. Regression-check for the same unscoped-log pattern elsewhere

- [x] 4.1 Search the codebase (`grep -rn "findMany" lib/projections ingest` and a manual read of `lib/projections/team-rating.ts`, `lib/projections/opponent-factor.ts`) for any other player- or team-level game-log query that lacks a season filter where one is expected, and verify each one found is either already correctly scoped or file a follow-up note in this change's proposal if a new instance is found (do not expand this change's scope to fix an unrelated capability without updating the proposal first).

  Done: full sweep of every `findMany`/`findUnique`/`groupBy` in `lib/projections` and `ingest/generate-projections.ts`. Findings recorded in proposal.md's "Follow-up findings" section:
  - `loadUnavailableScorers()`'s third call to `loadPlayerGameLog` — not a bug (recency-only), handled by task 1.3's revised wording.
  - `loadOpponentFactors()` has no season filter — a real second instance of the same bug class, measured as material (Knicks opponent factor 0.914 season-scoped vs. 1.004 unscoped), left for a separate follow-up change rather than folded in here.
  - Everything else checked (`loadLeagueRecentGames`, `loadTeamProjectionInput`'s recent-games query, `loadPlayedGameIds`, `loadOutSnapshotGameIds`, `computeResidualStdevs`'s backtest window) is either already correctly season-scoped or deliberately cross-season by pre-existing, documented design (team-level recency windows; the residual-stdev backtest's accepted look-ahead bias) and consumed in a way that doesn't let cross-season data distort a current signal.

## Workflow follow-up

- Deploy the fix so the next scheduled `ingest/run-all-sync.ts` run picks it up for newly-generated projections.
- After a few days of new `v3-season-scoped` (or chosen tag) projections have graded, compare their win rate against the prior tag's history via the betting accuracy page to confirm the fix improved outcomes for veteran players.
- Archive this change once the above verification is complete.
