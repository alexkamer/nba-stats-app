# Design

## Context

See proposal.md for motivation. Relevant current state:

- `Odds` (prisma/schema.prisma) stores one best-effort snapshot per game (provider, spread, overUnder, homeMoneyline, awayMoneyline, favoriteTeamId), sourced from ESPN's `summary` endpoint's `pickcenter` field. It's populated by `ingest/backfill-odds.ts` (one-time) and read-only on the game/team pages for retrospective grading. Coverage is sparse/era-dependent historically, but confirmed present for the current season.
- ESPN's core API (`sports.core.api.espn.com/.../events/{id}/competitions/{id}/odds/{providerId}`) exposes richer per-game data for scheduled games: open vs. current spread/total/moneyline (line movement), and a `propBets` sub-resource (paginated, ~1,249 items for a sampled game) with per-athlete prop lines across many stat types (points, rebounds, assists, 3PM, steals, blocks, combos, double-double/triple-double, milestones, quarter/half markets). Confirmed free, no API key.
- The same `summary` payload exposes ESPN's own `predictor` (per-team game projection + win-probability). Confirmed via direct probing that this field is empty once a game reaches `FINAL` and on old (2022) games — it is not retained historically by ESPN, so it must be captured proactively, before tip-off, if it's ever to be graded.
- Team/player statistical history already exists: `TeamSeasonStat`, `PlayerSeasonStat` (season aggregates), `TeamGameStat`, `PlayerGameStat` (per-game box scores) — enough to derive recent-form and home/away-aware projections without new ingestion.
- Ingest follows an established pattern: idempotent, self-healing one-off/backfill scripts (`ingest/backfill-*.ts`) plus recurring "sync" scripts invoked from `ingest/run-all-sync.ts`, a single cron entry point run every 15-30 minutes (exact scheduler left to deployment).

## Goals / Non-Goals

**Goals:**
- Capture richer market odds (with line movement) and player prop odds for scheduled games, plus a one-time pre-game predictor snapshot, using the existing ingest patterns.
- Produce an independently-computed, explainable projection (not a black box) for game outcomes and player props, derived solely from this app's own stat tables.
- Freeze each projection at creation time so later grading reflects what was actually predicted beforehand, never recomputed with hindsight.
- Track graded accuracy for our model and ESPN's predictor separately, so blending is an evidence-based decision for a later change, not assumed now.
- Ship a usable page even with zero accuracy history (cold start) and partial odds/props coverage (sparse by nature).

**Non-Goals:**
- No paid odds vendor or API key of any kind (user explicitly ruled this out) — all new data comes from ESPN's existing free endpoints.
- No blending of ESPN's predictor into our own projection in this change — it's tracked and displayed, not trusted, until there's graded evidence.
- No backfilling ESPN predictor data for past seasons — confirmed impossible, since ESPN itself doesn't retain it.
- No live in-game odds/line-movement streaming or push alerts — periodic polling on the existing sync cadence is sufficient.
- No multi-sportsbook comparison — follow the existing `Odds` model's precedent of keeping only the highest-priority provider ESPN lists (DraftKings, provider id 100 in current testing).

## Decisions

### Extend `Odds` with open-line columns rather than a new time-series table
Add nullable `openSpread`, `openOverUnder`, `openHomeMoneyline`, `openAwayMoneyline` to the existing `Odds` model and switch its source from `summary`'s `pickcenter` to the core API's `.../odds/{providerId}` resource, which already returns both open and current values. The row is upserted on each sync run up to tip-off (open values set once, current values refreshed).
- **Alternative considered**: a full time-series table of every odds snapshot. Rejected for v1 — nothing in the spec needs intra-day movement history, only "opened at X, now at Y"; a time series adds storage/complexity with no consumer.

### New `PlayerPropOdds` table, one row per prop side
One row per (game, player, stat type, side [over/under]), carrying the target line, odds, open line/odds, and provider — matching the shape ESPN actually returns (each over and under line for a stat appears as a separate `propBets` entry). Scoped to the same single provider as game odds.

### Single predictor snapshot per game, not a time series
`PredictorSnapshot` captures ESPN's `predictor` projection once per game, as early as it's available (effectively "whenever the sync job first sees the game as scheduled"), since the only later use is grading against the final result — no need to track how ESPN's own number moved pre-game.

### Projections are persisted rows, computed once, frozen pre-game
`GameProjection` (one per game: projected home/away score or margin, method/version tag) and `PlayerPropProjection` (one per game/player/stat: projected value, method/version tag) are written by a sync job before tip-off and never recomputed afterward. Grading always reads this frozen value — this is what makes the accuracy record honest.
- **Alternative considered**: compute projections on-demand at page render time from current stats. Rejected — by game time, "current stats" already include that game's own result once it's final, which would silently corrupt grading; freezing avoids needing to reconstruct "stats as of game day" after the fact.

### Grading columns live on the projection/snapshot rows, not a generic grading table
`GameProjection`, `PredictorSnapshot`, and `PlayerPropProjection` each get their own nullable `gradedCorrect`/`gradedAt`/actual-value columns, filled in by a grading job once the game is `FINAL`.
- **Alternative considered**: a generic `PredictionGrade` join table keyed by (game, source, market type), extensible to arbitrary future sources. Rejected for v1 — there are exactly two sources (our model, ESPN) and three fixed shapes (game projection, predictor, prop projection); the generic join adds indirection with no current payoff. Revisit if a third source is ever added.

### v1 projection methodology: recency-weighted statistical baseline, not ML
Game margin projection: blend each team's season per-game scoring differential with a recent-game rolling average (recency-weighted), adjusted for home/away split, to produce a projected margin; compare to the market spread to form a pick. Player prop projection: blend a player's season per-game average for the tracked stat with their recent-game rolling average, adjusted for recent minutes trend; compare to the prop line. Both are simple, inspectable, and reuse data already in `TeamSeasonStat`/`PlayerSeasonStat`/`TeamGameStat`/`PlayerGameStat`.
- **Alternative considered**: a possession-/pace-adjusted efficiency model or a trained regression model. Rejected for v1 as more than is needed to validate the overall approach and start accumulating a graded track record; the frozen-projection/grading design means the methodology can be swapped or upgraded later (as a new `method`/version tag) without touching the rest of the system.

### New recurring sync job, following the existing cron pattern
Add `ingest/sync-betting-odds.ts` (fetch/refresh game + prop odds and predictor snapshots for scheduled games) and a projection-generation step (compute + freeze `GameProjection`/`PlayerPropProjection` once per game, as soon as enough market/stat data exists) to the same recurring cadence as `ingest/run-all-sync.ts`, plus extend the existing completed-games sync (or add a small grading step) to grade projections/snapshots once a game goes final.

## Risks / Trade-offs

- **[Prop odds volume]** ~1,249 prop entries for a single game, paginated 25-at-a-time, across ~10-15 games/night → hundreds of HTTP calls per sync cycle. **Mitigation**: only fetch the stat types the page actually surfaces (points/rebounds/assists/3PM/steals/blocks/combos), not every quarter/half/milestone market; keep the existing self-healing/idempotent script pattern so a partial run is safe to resume.
- **[Sparse coverage]** Market odds, props, and predictor data aren't guaranteed for every scheduled game (same sparse/era-dependent pattern as existing `Odds`). **Mitigation**: every consuming requirement already specifies graceful omission (no projection/pick fabricated from missing data); the page's no-data fallback (betting-insights-page spec) covers the user-facing side.
- **[Cold-start accuracy]** The accuracy scoreboard will be empty or thin for a long stretch after this ships, since ESPN's predictor can't be backfilled. **Mitigation**: explicit empty/low-sample state on the page (spec'd), and the page's value doesn't depend on the scoreboard alone.
- **[v1 methodology may be weak]** A recency-weighted average is a simple baseline and may not beat the market. **Mitigation**: this is explicitly why grading/accuracy tracking exists — treated as an expected, visible outcome to learn from, not a defect to hide.

## Migration Plan

1. Schema migration: extend `Odds` with open-line columns; add `PlayerPropOdds`, `PredictorSnapshot`, `GameProjection`, `PlayerPropProjection` tables (all additive, no breaking changes to existing models/queries).
2. Add `ingest/sync-betting-odds.ts` (odds/props/predictor fetch) and a projection-generation step; wire both into `ingest/run-all-sync.ts`.
3. Add a grading step that runs after the existing completed-games sync, since that's already the job that notices a game went final.
4. Add API routes + the new page/nav link last, once there's real data flowing to render.
5. Rollback: all additive schema changes and new files; disabling the new sync scripts fully reverts behavior with no impact on existing pages.
