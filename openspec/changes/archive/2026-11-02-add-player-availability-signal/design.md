# Design

## Context

See proposal.md for motivation. Relevant current state:

- `src/lib/espn-team-injuries.ts` already fetches ESPN's per-team injury list (`getTeamInjuries(teamEspnId)`) for team pages — live, not persisted, returns `{ athleteEspnId, status, date, comment, injuryType, returnDate }` per entry. `status` is ESPN's free-text field (seen values include "Out", "Day-To-Day", "Questionable", "Probable" in practice, not an enum ESPN documents).
- `src/lib/espn-team-depth-chart.ts` fetches a general position-ranked depth chart, also live/non-persisted — not a per-game confirmed lineup, and not used by this change (it doesn't tell us who's unavailable, only rank order).
- `Player.espnId` and `Team.espnId` are the join keys already used everywhere else to resolve ESPN's `$ref`-based ids against this app's own `Player`/`Team` rows.
- `PlayerGameStat.starter` (boolean, nullable) already exists per historical game row (`ingest/mappers/boxscore.ts`), giving a "did this player start, and by extension roughly how big a role did he have" signal for every past game, including games a given player missed entirely (no row at all for that player/game).
- `PredictorSnapshot` (prisma/schema.prisma:293) is the existing precedent for "capture a volatile pre-game ESPN value once, frozen, never touched after the game is no longer scheduled" — same shape this change needs for availability, except availability needs to be *refreshable* pre-game (closer to `Odds`'s current-value-refreshed-until-tip-off pattern) rather than captured exactly once.
- `ingest/generate-projections.ts` already queries `prisma.game.findMany({ where: { status: "SCHEDULED", ... } })` and loops per game/player; this change's new logic slots into the same loop rather than a separate pass, since availability is only meaningful at the moment a projection is about to be computed.
- `ingest/run-all-sync.ts` runs `sync-betting-odds.ts` before `generate-projections.ts` — the new availability sync step follows the same ordering requirement (must run, and be queryable, before projection generation).

## Goals / Non-Goals

**Goals:**
- Persist a frozen-but-refreshable-pre-tip availability status per (game, player), sourced from ESPN's existing injury endpoint, no new vendor.
- Make `generate-projections.ts` consult that status: skip OUT players' own prop projections, adjust team offense input for a team missing a key scorer, and bump a teammate's projection when a player he's historically shared minutes with is out.
- Keep the adjustment logic as simple/inspectable arithmetic, consistent with the existing recency-blend methodology — no new modeling framework introduced for this.

**Non-Goals:**
- No paid lineup/minutes vendor (Rotowire etc.) — see proposal.md.
- No change to the game-margin rating methodology (Elo/SRS) — separate change.
- No live/in-game availability tracking — only pre-tip-off scheduled-game snapshots, same scope boundary as `Odds`/`PredictorSnapshot`.
- No attempt to normalize ESPN's free-text injury `status` into a clinical taxonomy beyond the five buckets this change needs (OUT / DOUBTFUL / QUESTIONABLE / PROBABLE / AVAILABLE) — just enough to drive the three behaviors above.
- No UI redesign — `src/app/betting/page.tsx`'s existing `dnp`/`ruledOut` fields get a new, more reliable data source, not new presentation.

## Decisions

### New `PlayerAvailability` model, one row per (game, player), refreshed pre-tip
```
model PlayerAvailability {
  id         Int               @id @default(autoincrement())
  gameId     Int               @map("game_id")
  game       Game              @relation(fields: [gameId], references: [id])
  playerId   Int               @map("player_id")
  player     Player            @relation(fields: [playerId], references: [id])
  status     AvailabilityStatus @map("status") // OUT | DOUBTFUL | QUESTIONABLE | PROBABLE | AVAILABLE
  comment    String?
  capturedAt DateTime           @map("captured_at")
  updatedAt  DateTime           @updatedAt @map("updated_at")

  @@unique([gameId, playerId])
  @@map("player_availability")
}
```
- **Alternative considered**: fold this into `PredictorSnapshot`'s "capture once, never touch again" pattern. Rejected — availability genuinely changes pre-tip (a "Questionable" resolves to playing or sitting, often hours before tip), so a single immutable snapshot would frequently be stale by game time. This needs `Odds`'s refresh-until-tip-off behavior, not `PredictorSnapshot`'s write-once behavior.
- **Alternative considered**: a status enum matching ESPN's exact free-text values. Rejected — ESPN's `status` field isn't a documented enum and the app only needs to distinguish "definitely not playing" (OUT) from "everything else," plus enough granularity (DOUBTFUL/QUESTIONABLE/PROBABLE) to show on the UI; map ESPN's observed strings into the five-value enum at ingest time, defaulting an unrecognized string to QUESTIONABLE (never silently to AVAILABLE, so an unmapped status can't accidentally hide a real absence) and logging it for manual follow-up.
- Only players who are **rostered for one of the game's two teams** at sync time get a row; nothing is created for inactive/non-roster players.

### Status resolution: ESPN's injury-report absence means available
`getTeamInjuries` only returns players ESPN has flagged — most of a roster has no entry. The sync step treats "on the roster, no injury-report entry" as `AVAILABLE` explicitly (one row per rostered player per game), rather than leaving it unrepresented, so every downstream consumer can do a plain lookup instead of a "found vs. not found" branch.

### Sync step runs where `sync-betting-odds.ts` runs, before `generate-projections.ts`
New `ingest/sync-player-availability.ts`, added to `ingest/run-all-sync.ts`'s `SCRIPTS` array immediately after `sync-betting-odds.ts` and before `generate-projections.ts`. For every `SCHEDULED` game, call `getTeamInjuries` for both teams, upsert a `PlayerAvailability` row per rostered player (update `status`/`comment` if the row already exists and the game is still `SCHEDULED`; leave it untouched once the game is no longer `SCHEDULED`, mirroring `backfillMissingMarketLines`'s re-check-until-tip-off pattern instead of introducing a second backfill pass).
- **Alternative considered**: a separate backfill-style second pass like `backfillMissingMarketLines()`. Rejected — unlike market lines, which can be entirely absent at first discovery, availability rows are created for every rostered player up front (defaulting to AVAILABLE), so there's no "missing row" case to backfill — only a "status changed" case, which a plain upsert on every sync run already handles.

### Prop projection: skip entirely on OUT, no change on anything else
In `generatePlayerPropProjections` (`ingest/generate-projections.ts`), look up the player's `PlayerAvailability` row for the game; if `status === "OUT"`, `continue` without creating a projection (same "never fabricate" precedent as the existing null-return paths in `player-prop-projection.ts`). DOUBTFUL/QUESTIONABLE/PROBABLE/AVAILABLE all proceed unchanged for this player's own projection — the data doesn't support confidently discounting a "Questionable" player's own number, and doing so without evidence would just trade one unvalidated assumption for another.
- **Alternative considered**: scale down a Questionable/Doubtful player's own projection by some factor. Rejected for v1 — there's no graded evidence yet for what factor would be correct, and the existing minutes-trend multiplier already captures *some* of this if the player has recently been playing fewer minutes. Revisit once graded data exists broken out by availability status.

### Recent-form window already naturally excludes missed games
`loadPlayerGameLog` (`ingest/generate-projections.ts`) already queries `PlayerGameStat` rows, which only exist for games a player actually appeared in — a missed game has no row, so it's already excluded from `recentValues`/`recentMinutes` without any new filtering logic. The "Player's own recent-form window excludes games he missed" spec requirement is satisfied by existing behavior; no code change needed there, only documenting it as a now-specified guarantee.

### Team offense adjustment: proportional scoring-share subtraction, not a full re-projection
In `generateGameProjections`, after loading each team's `TeamProjectionInput`, also load each team's rostered players' recent per-game scoring and their `PlayerAvailability` status for this game. For any player `OUT`, reduce that team's blended offense (`homeOff`/`awayOff` in `game-projection.ts`) by his recent-average points **times a fixed redistribution-loss factor**, rather than assuming his points simply vanish (teammates absorb some of the usage) or assuming they're fully replaced (the whole reason he's a difference-maker is that he isn't fully replaceable).
- **Decision**: redistribution-loss factor = 0.7 (i.e., the team recovers 30% of an absent player's scoring through increased teammate usage, loses the rest) — a single tunable constant, not per-team/per-player, consistent with the project's existing philosophy of simple clamped constants (`MIN_TREND_MULTIPLIER`, `BETTABLE_EDGE_STDEV_MULTIPLIER`, etc.) over a fitted model. Tag it clearly as a placeholder constant to revisit once graded evidence with/without this adjustment exists.
- **Alternative considered**: compute an empirical team-level factor from this season's own completed games where a given player was out (team's actual scoring in those games vs. his season PPG). Rejected for v1 — most teams won't have enough qualifying missed-player games this season for that to be stable, and it adds a second empirical estimation on top of the per-player one below; a single flat constant is simpler to reason about and to later replace with the empirical version once there's enough data (that upgrade is a `method` version bump, not a breaking change).
- Only applied for a player whose recent per-game scoring is at least a threshold share of the team's recent total scoring (reuses the existing `MIN_RECENT_GAMES_FOR_BLEND` ≥3-game qualifying bar before his own average is trusted) — a deep bench player going OUT doesn't trigger this adjustment, keeping it focused on the "missing a real contributor" case the proposal is about.

### Teammate role-bump: empirical "what changed last time he sat," confidence-gated by sample size
New small module (e.g. `lib/projections/teammate-role-adjustment.ts`), called from `generatePlayerPropProjections`: for a player P whose game tonight has a teammate T frozen as OUT, look at completed games this season where T was snapshotted OUT (or, if no such row exists for a FINAL game — this is a new table with no history before this ships — fall back to games where T has no `PlayerGameStat` row at all, i.e. he didn't play and it wasn't a DNP-active scratch, same heuristic `grade-predictions.ts` already uses for "never suited up"). Compute P's average stat value in exactly those games vs. his overall recent/season baseline; if there are at least 2 such games, apply the ratio (clamped, same style as `minutesTrendMultiplier`, to 0.85x-1.3x) as an additional multiplier on P's projection. Below 2 qualifying games, apply no adjustment (neutral 1x) — there's no reliable signal yet, not even a "trend" to extrapolate.
- **Alternative considered**: look only at *this specific pairing* (P's minutes specifically when T is out) rather than P's whole stat production. Equivalent to what's described — "this season's games T already missed" is exactly the pairing-specific slice; stated here for clarity since cross-season data isn't used (role changes year to year; last season's backup-minutes pattern isn't trustworthy evidence for this season's rotation).
- **Alternative considered**: use the depth-chart rank order to decide who "next man up" is, rather than empirical history. Rejected — depth chart rank is a general season-long chart, not game-specific, and doesn't capture real rotation idiosyncrasies (e.g. a team upgrading a different bench player's role rather than the depth-chart's nominal backup). The empirical approach only credits a teammate who has *actually* produced more in exactly this scenario before, which is the whole value the proposal's "load management" example is after.
- This only ever adjusts *other* players' projections — a player's own OUT status already removes his own projection entirely (decision above); this decision is purely about his teammates.

## Risks / Trade-offs

- **[ESPN injury-report lag]** ESPN's injury report can lag same-day shootaround decisions by hours, same risk class as any free pre-game feed. **Mitigation**: the refresh-until-tip-off design (same as market-line backfill) catches any update ESPN does publish before tip; genuinely last-minute/local-beat-reporter-only news stays an acknowledged gap (and is exactly the evidence needed before considering a paid vendor, per proposal.md's non-goal).
- **[Free-text status mapping drift]** ESPN could introduce a new status string the mapping doesn't recognize. **Mitigation**: unmapped strings default to QUESTIONABLE (never silently AVAILABLE) and are logged, so a drift shows up as a visible warning rather than silently treating an out player as available.
- **[Flat redistribution-loss and role-bump constants are unvalidated guesses]** Same honest risk the original v1 methodology accepted for its own constants. **Mitigation**: both are tagged as placeholder constants in code/comments and are exactly what `prediction-accuracy-tracking`'s existing grading will now implicitly validate going forward (grade-over-time with vs. without an active availability adjustment becomes visible once there's enough graded post-ship data — no new grading machinery needed, since grading already runs against whatever projection was frozen).
- **[Cold start, no historical `PlayerAvailability` rows before this ships]** The teammate role-bump's "games T was snapshotted OUT" lookup will be empty for the first stretch after shipping, since this table starts empty. **Mitigation**: the DNP-row fallback heuristic (above) gives an immediate, if slightly noisier, proxy from day one using data that already exists; the snapshotted-OUT signal naturally takes over as it accumulates.

## Migration Plan

1. Schema migration: add `PlayerAvailability` model + `AvailabilityStatus` enum (additive only).
2. Add `ingest/sync-player-availability.ts`; wire into `ingest/run-all-sync.ts` between `sync-betting-odds.ts` and `generate-projections.ts`.
3. Add the OUT-skip check and recent-form exclusion documentation to `generatePlayerPropProjections`; add the team offense adjustment to `generateGameProjections`; add the new `teammate-role-adjustment.ts` module and its call site.
4. Point `src/app/betting/page.tsx`'s existing `dnp`/`ruledOut` display fields at the new persisted `PlayerAvailability` data instead of whatever ad hoc source they currently use (confirm exact current source during implementation).
5. Rollback: additive schema change and new/isolated files; disabling the new sync script and reverting the three call-site edits in `generate-projections.ts` fully reverts behavior with no impact on existing projections already frozen.
