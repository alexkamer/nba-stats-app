# Design

## Context

See proposal.md - Why. Two existing ingest steps already establish the pattern this change follows: `grade-predictions.ts` grades per-pick rows (`GameProjection`, `PlayerPropProjection`, `PredictorSnapshot`) against actual results once a game reaches `FINAL`, and `sync-aggregates.ts` maintains season-long per-team/per-player aggregates (`TeamSeasonStat`, `PlayerSeasonStat`, `Standing`). Both are wired into `ingest/run-all-sync.ts` in dependency order. `Odds.spread`/`Odds.overUnder` hold the *current* line, which stops being refreshed once a game leaves `SCHEDULED` (per the betting-odds-ingest capability) — so the value present when a game goes `FINAL` is the line in effect at tip-off, the same "frozen at pick time" assumption `GameProjection.marketMarginAtPick` already relies on. Team ATS/O-U tracking and daily-stat-leader tracking reuse that assumption rather than needing a new closing-line capture mechanism.

## Goals / Non-Goals

**Goals:**
- Compute team ATS/O-U and daily-leader data once, incrementally, as games go final — not live on every page read.
- Reuse the existing sync pipeline's ordering and idempotency conventions (self-healing re-runs, graded-once semantics) rather than inventing new ones.
- Keep the new page's data read-only and derived entirely from already-ingested data (`Odds`, `Game`, `PlayerGameStat`, `Player`) plus the new aggregate tables.

**Non-Goals:**
- Multi-season browsing for the history page (current season only, per the proposal's scope decision — the aggregate tables are still keyed by season so this isn't precluded later).
- Backfilling team ATS/O-U history for seasons before this change ships, beyond what a full re-run of the new script against existing `FINAL` games naturally produces.
- Any change to how `Odds` captures or refreshes lines (betting-odds-ingest is unchanged).

## Decisions

**New explicit Prisma models, not JSON `extra` columns.** `TeamSeasonStat`/`PlayerSeasonStat` have an `extra: String?` JSON escape hatch for ESPN's loosely-typed season-stat payloads, but every betting-specific model (`Odds`, `GameProjection`, `PlayerPropProjection`) uses explicit typed columns because this data is queried, filtered, and graded, not just displayed verbatim. ATS/O-U records and daily leaders are computed and queried the same way, so:

- `TeamCoverRecord` (new model): one row per `(teamId, seasonId)`. Columns: `atsWins`, `atsLosses`, `atsPushes`, `atsHomeWins`, `atsHomeLosses`, `atsHomePushes`, `atsAwayWins`, `atsAwayLosses`, `atsAwayPushes`, `atsCurrentStreak` (signed int: positive = covering streak, negative = non-covering streak, 0 = none yet), and the same nine-column shape (`ou*`) for over/under, plus `ouCurrentStreak`. Flat columns over a child table per graded game — the page only ever needs the aggregate and the streak, never a per-game cover log, and flat counters make incrementing on each new graded game a single-row update.
- `DailyStatLeader` (new model): one row per calendar date with completed games. Columns: `date` (unique), and a `leaders` relation to a small `DailyStatLeaderEntry` child table (`dailyStatLeaderId`, `playerId`, `pointsReboundsAssists`, `hadTripleDouble`) to represent ties cleanly (the spec requires recording *all* tied leaders, not picking one arbitrarily).
- Season crown tally (`DailyStatLeaderTracking` → "Season crown tally per player") is derived by counting `DailyStatLeaderEntry` rows per player for the season's date range at read time — a `COUNT ... GROUP BY playerId` over a small table, not worth a separately maintained counter.

**Alternative considered:** reuse `TeamSeasonStat.extra` for the cover-record columns. Rejected — mixing a loosely-typed ESPN passthrough blob with values this app computes and must query/sort by (e.g., "teams sorted by ATS win %") invites the same kind of implicit-contract drift the typed betting models were introduced to avoid.

**New ingest script `compute-cover-records.ts`, run after `grade-predictions.ts`.** Scans games that just went `FINAL` and haven't yet been folded into `TeamCoverRecord` (track via a `gradedAt`-style timestamp... but since `TeamCoverRecord` is an aggregate, not a per-game row, idempotency instead comes from a new `coverRecordComputedAt` timestamp added to `Odds` — set once an `Odds` row's game has been folded into the aggregate, so re-runs skip already-counted games the same way `grade-predictions.ts` skips already-graded rows). Added to `SCRIPTS` in `run-all-sync.ts` immediately after `grade-predictions.ts`, since it needs final scores (from `sync-completed-games.ts`) and is conceptually "grading against the market" the same way prediction grading is "grading against the model."

**New ingest script `compute-daily-stat-leaders.ts`, run alongside aggregates.** For each date with all of that date's games now `FINAL` and not yet present in `DailyStatLeader`, sums points+rebounds+assists per player across that date's `PlayerGameStat` rows, finds the max (ties kept), and checks each player's individual game rows for triple-double thresholds. Added to `SCRIPTS` after `sync-aggregates.ts` (needs final box scores) and can run independently of the cover-record step. "All of that date's games are final" is determined by checking no `Game` row for that date remains non-`FINAL` — a date with a postponed/mid-slate game simply isn't computed yet, consistent with the spec's "no leader for a date with no games" treatment of incomplete data as "not ready" rather than guessing.

**Prop hit-rate by `PropStatType`: extend `lib/accuracy/compute-accuracy.ts`, not a new module.** It already aggregates `PlayerPropProjection` rows into a hit rate; the stat-type breakdown is the same reduction keyed additionally by `statType` instead of a second computation path. The existing `/api/betting/accuracy` route gains the breakdown in its response rather than a new endpoint, and the history page's prop section calls that same route.

**New API routes under `/api/betting/history/*`** (`team-cover-records`, `daily-leaders`, `birthdays`), one per section, mirroring the existing one-route-per-concern style of `/api/betting/upcoming` and `/api/betting/research/[playerId]`, rather than one combined endpoint — sections load and fail independently, matching the no-data-fallback-per-section requirement.

**Birthdays computed live, no new table.** `Player.birthDate` and `active` already exist; "active players whose birth month/day match today" is a single indexed-enough query (`active = true`, filtered in JS or via a raw month/day comparison since SQLite's date functions are limited) with no history to accumulate, so this is the one section with no backing tracking capability, as the proposal already states.

## Risks / Trade-offs

- **Sparse `Odds` coverage** (per the schema's documented era gaps) → cover-record counts will undercount games where no line was ever captured, same caveat the betting-insights page already carries; the spec's "exclude games with no recorded line" requirement makes this explicit rather than silently treating a missing line as a push.
- **Ties in the daily-leader computation** → handled structurally via the `DailyStatLeaderEntry` child table rather than an arbitrary tiebreak, so the UI must be able to render more than one name per day.
- **`coverRecordComputedAt` marker on `Odds`** couples an odds-ingest-owned table to a tracking capability it doesn't otherwise know about → acceptable, since `GameProjection.marketMarginAtPick`/`PredictorSnapshot.gradedAt` already establish the convention of grading-side timestamps living next to the data they grade.
- **Full-slate check for daily leaders** (waiting for every game on a date to be `FINAL`) → a single postponed/rescheduled game delays that whole date's leader indefinitely until it resolves; acceptable since the alternative (computing on partial data) risks a leader being shown and then silently changing, which the no-hindsight convention used elsewhere in this app explicitly avoids.
