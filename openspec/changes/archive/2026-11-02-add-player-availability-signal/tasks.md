# Tasks

## 1. Schema

- [x] 1.1 Add `AvailabilityStatus` enum (OUT, DOUBTFUL, QUESTIONABLE, PROBABLE, AVAILABLE) and `PlayerAvailability` model (per design.md's "New `PlayerAvailability` model" decision) to `prisma/schema.prisma`, with a `@@unique([gameId, playerId])` constraint; verify `npx prisma migrate dev` generates and applies a clean, additive-only migration and `npx prisma validate` passes.

## 2. Availability sync

- [x] 2.1 Add `lib/espn/injury-status-mapping.ts` (or similar) mapping ESPN's observed free-text `status` strings to `AvailabilityStatus`, defaulting an unrecognized string to `QUESTIONABLE` with a logged warning (never silently `AVAILABLE`, per design.md "Free-text status mapping drift"); verify a unit test covers at least one mapped value per enum case plus the unrecognized-string fallback.
- [x] 2.2 Add `ingest/sync-player-availability.ts`: for every `SCHEDULED` game, fetch both teams' rosters and `getTeamInjuries` (reusing `src/lib/espn-team-injuries.ts`), then upsert one `PlayerAvailability` row per rostered player — mapped status for players on the injury report, `AVAILABLE` for everyone else — only updating rows for games still `SCHEDULED` (per design.md's refresh-until-tip-off decision); verify by running the script against the dev DB and confirming every rostered player on an upcoming scheduled game has exactly one row, and re-running it updates (not duplicates) existing rows.
- [x] 2.3 Wire `sync-player-availability.ts` into `ingest/run-all-sync.ts`'s `SCRIPTS` array, positioned after `sync-betting-odds.ts` and before `generate-projections.ts`; verify `npx tsx ingest/run-all-sync.ts` runs the full pipeline in order without error.

## 3. Player prop projection: skip OUT players

- [x] 3.1 In `generatePlayerPropProjections` (`ingest/generate-projections.ts`), look up each player's `PlayerAvailability` row for the game and `continue` (no projection created) when `status === "OUT"`; verify a unit/integration test (or targeted script run against seeded data) shows no `PlayerPropProjection` row is created for a player snapshotted `OUT`, while a `QUESTIONABLE`/`PROBABLE`/`AVAILABLE` player still gets one.
- [x] 3.2 Add a code comment on `loadPlayerGameLog` documenting that its existing query already excludes games a player didn't play (no `PlayerGameStat` row), satisfying the "recent-form window excludes missed games" requirement with no behavior change; verify `npx tsx -e` or an existing test still reflects this (no new test needed since behavior is unchanged, per design.md).

## 4. Team offense adjustment for an unavailable top scorer

- [x] 4.1 Extend `TeamProjectionInput` (or add a sibling input) in `lib/projections/game-projection.ts` to accept each rostered player's recent per-game scoring and availability status for the game, and apply the 0.7 redistribution-loss factor from design.md to reduce `homeOff`/`awayOff` when a qualifying (≥3 recent games, meaningful scoring share) player is `OUT`; verify `lib/projections/game-projection.test.ts` covers: a team missing its top scorer projects lower offense than the same team with him available, and a team missing a deep-bench player (below the qualifying threshold) is unaffected.
- [x] 4.2 Update `loadTeamProjectionInput` and `generateGameProjections` in `ingest/generate-projections.ts` to fetch and pass each team's roster scoring/availability data into the extended function from 4.1; verify running `generate-projections.ts` against a seeded scheduled game with a manually-inserted `OUT` row for a top scorer produces a visibly lower `projectedHomeScore`/`projectedAwayScore` for that team than before the row existed.

## 5. Teammate role-bump adjustment

- [x] 5.1 Add `lib/projections/teammate-role-adjustment.ts`: given a player's game log, his season's games where a specified teammate was unavailable (via `PlayerAvailability` `OUT` rows, falling back to "teammate has no `PlayerGameStat` row for that game" per design.md's cold-start fallback), and a minimum qualifying-game count of 2, compute and return a clamped (0.85x-1.3x) multiplier, or `1` (neutral) below the qualifying threshold; verify `lib/projections/teammate-role-adjustment.test.ts` covers: a clear production increase in qualifying games produces a >1 multiplier, fewer than 2 qualifying games returns exactly `1`, and the clamp bounds are respected for an extreme input.
- [x] 5.2 Wire the new module into `generatePlayerPropProjections`: for each OVER/UNDER-eligible prop, determine the player's current-game teammates frozen `OUT` tonight, compute the role-bump multiplier for each, and apply it on top of the existing minutes-trend/opponent-factor multipliers in `projectPlayerStat`'s result; verify a unit test on the combined pipeline shows the multiplier is applied once per qualifying absent teammate and is a no-op (1x) when no teammate is out.

## 6. Display wiring

- [x] 6.1 Confirm the current data source behind `src/app/betting/page.tsx`'s `dnp`/`ruledOut` fields (likely `src/app/api/betting/upcoming/route.ts`) and repoint `ruledOut` at the new persisted `PlayerAvailability` status (`OUT`) instead of its current source; verify the betting page still renders the same visual warning for a known `OUT` player in a manual check against seeded/dev data, and that `ruledOut` is `false` for an `AVAILABLE`/unlisted player.

## 7. Integration verification

- [x] 7.1 Run `ingest/run-all-sync.ts` end-to-end against the dev database and confirm: availability rows exist for all rostered players on upcoming scheduled games, at least one seeded `OUT` scenario produces a lower team offense projection and no prop projection for that player, and the full pipeline (odds -> availability -> projections -> grading) completes without error.
- [x] 7.2 Run the full test suite (`npm test` or project's equivalent) and confirm all new and existing tests pass, with no regression in `lib/projections/*.test.ts` or `lib/accuracy/*.test.ts`.

## Workflow follow-up

- Archive this change once implementation and verification above are complete and reviewed.
