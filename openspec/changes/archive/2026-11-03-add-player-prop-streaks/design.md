# Design

## Context

Every other Cover Story section (team cover records, daily stat leaders, prediction accuracy) is backed by a table maintained incrementally as games finish — see `team-cover-record-tracking` and `daily-stat-leader-tracking`. This feature's inputs are different: it only needs a live snapshot of *today's* (or the next relevant date's) `PlayerPropOdds` plus each flagged player's own recent `PlayerGameStat` rows. There's nothing to grade after the fact and no running aggregate to maintain across games, so there is no new table — `player-prop-streak-tracking` is a read-only query computed at request time, same shape as `src/app/api/betting/history/team-cover-records/route.ts` but without a backing Prisma model of its own.

## Goals / Non-Goals

**Goals:**
- Reuse the existing `PlayerPropOdds` / `PlayerGameStat` data with no schema changes.
- Keep the computation cheap enough to run per-request (bounded by: eligible props on one date × last-10-games lookup per player/stat).

**Non-Goals:**
- No fixed floor for combo (`POINTS_ASSISTS`, etc.) or `DOUBLE_DOUBLE`/`TRIPLE_DOUBLE` stat types — the user's examples only defined floors for `POINTS`, `REBOUNDS`, `ASSISTS`; extending to other stat types is a follow-up if wanted.
- No historical "streak audit trail" — the section always reflects current data, nothing is persisted or graded against outcomes.
- No comparison against the player's actual prop line value — the floor is fixed per stat type, not derived from `PlayerPropOdds.line`.

## Decisions

- **Fixed floors as a small constant map** (`POINTS: 10, REBOUNDS: 6, ASSISTS: 2`), not configurable or derived — matches the user's explicit examples; a data-driven floor (e.g. percentile of league scoring) was considered and rejected as unnecessary complexity for three fixed numbers.
- **Relevant date resolution lives in the query, not a separate job**: find the earliest `Game.date >= startOfToday` that has at least one `PlayerPropOdds` row with `side = OVER` and `statType IN (POINTS, REBOUNDS, ASSISTS)`; evaluate all eligible props on that single date. If none exists, return an empty result rather than falling further forward indefinitely.
- **Streak/hit-rate computed from `PlayerGameStat` ordered by `game.date desc`**, limited to the 10 most recent rows per player — consecutive streak is the count of leading rows (from most recent) meeting the floor before the first miss; hit-rate is hits ÷ rows-considered (≤10).
- **One API route, one query**: `GET /api/betting/history/player-streaks` returns the resolved date plus the list of qualifying player/stat entries; no pagination needed since the eligible pool (today's or next date's Over props on 3 stat types) is small.

## Risks / Trade-offs

- [Per-request cost scales with number of eligible props × per-player game-log query] → bounded in practice (one slate's Over props on 3 stat types is small); add a short cache window later if this page's load pattern makes it matter.
- [Picking "nearest upcoming date with any eligible prop" could jump several days ahead during an All-Star break or similar gap, surfacing streaks for games far in the future] → acceptable: the alternative (empty section) was explicitly rejected by the user in favor of showing the next slate's streaks.
