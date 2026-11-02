# Proposal

## Why

Graded data shows our own game-winner pick hits only 9/21 (42.9%) vs. ESPN's
own predictor at 15/21 (71.4%) on the same games, and the player-prop model's
baseline hit rate sits at a near-coin-flip 55% before the confidence filter.
None of our projections currently know whether a key player is actually
going to play tonight — `minutesTrendMultiplier` only looks backward at a
player's own last 3 games, and the team-level game model has no concept of
"missing their best scorer." The app already fetches ESPN's live injury
report and depth chart for team pages (`src/lib/espn-team-injuries.ts`,
`src/lib/espn-team-depth-chart.ts`) and already records a `starter` flag on
every historical `PlayerGameStat` row — none of this reaches the projection
pipeline. This change wires that existing, free data into the projections
so a ruled-out star stops silently corrupting both his own prop and his
team's and teammates' numbers.

## What Changes

- Add a new persisted, frozen pre-game `PlayerAvailability` snapshot per
  (game, player): status (OUT / DOUBTFUL / QUESTIONABLE / PROBABLE /
  AVAILABLE), captured by the sync pipeline from ESPN's existing injury
  report, same frozen/no-hindsight pattern as `PredictorSnapshot`.
- Refresh that snapshot up to tip-off for still-`SCHEDULED` games, mirroring
  how `backfillMissingMarketLines()` catches a market line up to game time,
  so a late-breaking "Questionable" -> "Out" decision isn't missed just
  because the snapshot ran too early.
- When a player is snapshotted `OUT` for a game: skip generating a
  `PlayerPropProjection` for that player/game entirely (not just hide it in
  the UI), and exclude games a player didn't play from his own recent-form
  window used elsewhere (so a since-resolved earlier absence doesn't quietly
  drag down his baseline).
- Adjust each team's offense input in the game projection downward when its
  highest-usage/scoring player is `OUT`, proportional to that player's
  recent share of the team's scoring — instead of leaving team PPG as if
  he were available.
- Derive a minutes/usage redistribution signal for a player's teammates from
  already-ingested history: when a player sits, look at prior games this
  season he already missed and how much more his teammates' minutes/stat
  production rose in those specific games, and apply that empirically-
  derived bump to the current projection instead of the current flat
  "minutes trend" multiplier alone.
- **Non-goal for this change**: no paid lineup/minutes vendor (e.g.
  Rotowire). Revisit only if graded misses after this ships cluster around
  late/surprise-rest scenarios ESPN's own injury feed doesn't catch in time.
- **Non-goal for this change**: no change to the game-margin methodology
  itself (e.g. an Elo/SRS rating system) — that is a separate, independently
  proposed change.

## Capabilities

### New Capabilities
- `player-availability-tracking`: captures and freezes a pre-game
  availability status per (game, player) from ESPN's injury report, refreshed
  up to tip-off, for projections and grading to consume.

### Modified Capabilities
- `betting-projections` (currently only defined in the not-yet-archived
  `add-betting-insights-page` change, at
  `openspec/changes/add-betting-insights-page/specs/betting-projections/spec.md`
  — reusing that exact capability path): player prop and game projections
  must now account for a player's frozen availability status rather than
  assuming every rostered player is available.

## Impact

- **New**: `PlayerAvailability` Prisma model + migration; a sync step
  (likely `ingest/sync-player-availability.ts`, wired into
  `ingest/run-all-sync.ts` alongside `sync-betting-odds.ts`) that calls the
  existing `getTeamInjuries` helper and persists/refreshes snapshots.
- **Modified**: `ingest/generate-projections.ts` (skip `OUT` players, feed
  availability into team offense adjustment and minutes redistribution),
  `lib/projections/player-prop-projection.ts` and
  `lib/projections/game-projection.ts` (accept availability/redistribution
  inputs), `lib/projections/opponent-factor.ts`-adjacent new module for the
  "who stepped up last time" minutes signal.
- **Read, not modified**: `src/lib/espn-team-injuries.ts` (existing live
  fetch, reused instead of duplicated), `PlayerGameStat.starter` (existing
  column, reused).
- **Display**: `src/app/betting/page.tsx`'s existing `dnp`/`ruledOut` flags
  become backed by the new persisted snapshot instead of being computed
  live at request time (exact wiring left to design.md).
