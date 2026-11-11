# Design

## Context

See proposal.md for motivation. Two existing pipelines this builds on:

- `ingest/generate-projections.ts` computes `PlayerPropProjection` rows, one per `(gameId, playerId, statType)`, but only for `(player, statType)` pairs that already have a posted `PlayerPropOdds` row — it groups candidates off the odds table, not off team rosters. The projection math itself (`projectPlayerStat`, `computeOpponentFactors`, `computeTeammateRoleAdjustment`) has no dependency on a market line existing.
- `ingest/compute-daily-stat-leaders.ts` computes `DailyStatLeader` once every game on a calendar date (by local day-key) has reached `FINAL`, summing `PlayerGameStat` rows for that date. Both this change's leaderboard and its grading key off the same local-day convention.

Both pipelines run inside `ingest/run-all-sync.ts`'s fixed script order, which already runs `sync-player-availability.ts` before `generate-projections.ts`, and `sync-aggregates.ts`/`compute-daily-stat-leaders.ts` after `sync-completed-games.ts`.

## Goals / Non-Goals

**Goals:**
- Reuse the existing projection engine exactly, extending it to a full-roster candidate pool instead of a market-line-gated one.
- Match the existing "frozen once, pre-game, never recomputed" convention used by `GameProjection`/`PlayerPropProjection`, so grading never reflects hindsight.
- Grade against the already-existing `DailyStatLeader` capability rather than duplicating its box-score aggregation.

**Non-Goals:**
- No live/"Current" recomputation variant (unlike Best Bets) — there is no market line for this prediction to track drift against.
- No new minutes-projection model — reuses the existing recent-minutes trend multiplier baked into `projectPlayerStat`.
- No change to how `DailyStatLeader` itself is computed.

## Decisions

**New table, not a reuse of `PlayerPropProjection`.** A dedicated `KingOfTheCourtLeaderboard` (one row per calendar date) + `KingOfTheCourtEntry` (one row per `(leaderboard, player)`, holding rank and projected value) mirrors the `DailyStatLeader`/`DailyStatLeaderEntry` shape already in the schema. `PlayerPropProjection` is keyed per-game and per-stat-type with grading/market columns that don't apply here (no line, no side); forcing this leaderboard through that table would mean either a fake `statType` or a pile of nullable columns that only make sense for one "type" of row. A separate date-keyed table, grouping candidates across every one of that date's games in one place, matches how the leaderboard is actually read (whole-day ranking, not per-game).

**Candidate generation is a new orchestration pass, not a modification to `generatePlayerPropProjections`.** Today's prop-generation loop is driven by `PlayerPropOdds` groups; this change needs every non-OUT rostered player on a team with a game today, whether or not they have a posted prop. Bolting a second iteration mode onto that function would complicate its one existing job. Instead, a new function (e.g. `generateKingOfTheCourtLeaderboard`, same file or a sibling module under `ingest/`) iterates today's scheduled games' rosters directly, reusing `loadPlayerGameLog`, `loadOpponentFactors`, `computeTeammateMultiplier`, and `projectPlayerStat` as already-exported/shared helpers. Where a candidate also already has a `PlayerPropProjection` row for `POINTS_REBOUNDS_ASSISTS` on that game, the new pass computes the same inputs and necessarily gets the same output (same functions, same data) — it does not read the existing row, since the leaderboard also needs the full-roster bulk of players who have no such row at all; recomputing via the shared helpers keeps the two paths honest without needing to branch on "does a projection row already exist."

**Per-date, not per-game, candidate pool.** A player appears once per calendar date (not once per game) because almost every player plays at most one game per day; the leaderboard ranks by that single value directly. (If a slate ever had a legitimate doubleheader for one team, this would need revisiting, but that doesn't happen in this league's current scheduling.)

**Freeze trigger reuses the existing self-healing idempotency pattern.** Like `generatePlayerPropProjections`, the new pass only processes a calendar date that doesn't already have a `KingOfTheCourtLeaderboard` row, and runs every time `ingest/run-all-sync.ts` runs. The first run that sees every one of that date's games already discovered (i.e., `sync-betting-odds.ts` has found them, so their rosters/availability are known) freezes the leaderboard; later runs skip that date. This is the same timing behavior `PlayerPropProjection` already has, not a new guarantee.

**Insufficient-data omission, not fabrication.** A candidate with no season average and no recent games (new call-up, first career game) is left out of the leaderboard entirely, same as `projectPlayerStat` returning `null` already causes `generatePlayerPropProjections` to skip that `(game, player, statType)`.

**Grading waits on both inputs being ready.** Grading can only run once (a) every game scheduled for the date is `FINAL`, and (b) `DailyStatLeader` has a row for that date (computed by the existing `compute-daily-stat-leaders.ts`, itself already gated on "every game final"). The new grading step in `ingest/grade-predictions.ts` queries `DailyStatLeader` directly rather than re-deriving the day's actual leader from box scores, so it can never disagree with the already-trusted tally. "Hit" is defined as: the leaderboard's #1-ranked candidate (ties at rank 1 all count) is among `DailyStatLeader`'s recorded leader(s) for that date.

**Accuracy record is a new independent source, not folded into prop accuracy.** Per the user's framing, this is a much harder prediction than any single prop (it's a max over tens of players, not one line), so its hit rate needs to stand on its own in the scoreboard rather than being blended into — and dragging down — the existing per-prop-type accuracy numbers. Mirrors how Best Bets already gets its own separate accuracy record alongside the general prop breakdown.

## Risks / Trade-offs

- **[Risk]** Projecting every rostered player (not just props-posted stars) multiplies per-day DB/compute work roughly 15x per team vs. the current props-only pass. → Mitigation: reuses the same cached per-player game-log/opponent-factor/roster lookups `generatePlayerPropProjections` already built (`loadPlayerGameLog`, `loadOpponentFactors`, `loadTeamRosterIds`, etc.), so the added cost is extra calls to already-cheap pure functions, not new queries per player.
- **[Risk]** A late-breaking OUT after the leaderboard freezes (same risk already accepted for `PlayerPropProjection`) can leave an unavailable player's projection sitting at #1. → Mitigation: accepted as consistent with the existing convention; not solved differently here. Framing a miss like this as a model failure would be unfair, which is also why King of the Court gets its own accuracy bucket rather than being pooled with easier single-prop bets.
- **[Risk]** Ties at the top (two players projected to an identical value) are extremely unlikely with continuous projected values but not impossible. → Mitigation: grade a tie at rank 1 as a hit if *either* tied player matches the actual leader, consistent with `DailyStatLeader` itself already keeping every tied player as a leader rather than picking one arbitrarily.

## Migration Plan

Purely additive: new tables, a new ingest pass appended to `ingest/run-all-sync.ts` (after `generate-projections.ts`, since it reuses that step's loaded availability map; before `grade-predictions.ts`, which gets the new grading logic), a new grading query, and a new UI section. No existing table or behavior changes. No backfill of past dates planned — the leaderboard starts from the first date it runs after deployment.
