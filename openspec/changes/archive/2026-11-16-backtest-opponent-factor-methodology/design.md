# Design

## Context

`lib/projections/opponent-factor.ts`'s `computeOpponentFactors(rows: AllowedStatRow[])` is a pure function: given a flat list of `{ teamId, allowedValue }` rows, it computes the league average, then each team's allowed-average relative to it, falling back to a neutral `1` below `MIN_GAMES_FOR_FACTOR = 5` qualifying rows and clamping to `[0.85, 1.15]`. It has no database access and no season awareness itself — scoping is entirely the caller's responsibility. `ingest/generate-projections.ts`'s `loadOpponentFactors()` is the only caller, and it builds `rows` from every `TeamGameStat` row with `game.status = "FINAL"` and no season filter (see proposal.md - Why for the Knicks example and measured magnitude).

Because `computeOpponentFactors` is already pure and already has the right fallback/clamp behavior, this backtest can reuse it unchanged for every variant — exactly like `backtest-projection-methodology` reused `projectPlayerStat` unchanged. The only thing that differs between variants is which historical rows get passed in.

`TeamGameStat` holds 62,172 rows (two per `FINAL` game) back to the 2002-03 season.

## Goals / Non-Goals

**Goals:**
- Measure whether a season-scoped allowed-value history produces a better (lower-error) prediction of what a team will allow in its next game than the current unscoped (all-time) history, using the exact production function.
- Segment results by how far into its current season a team is when the prediction is made, since that's where a scoped-vs-unscoped divergence should matter most (early season, thin current-season sample) or least (late season, plenty of current-season sample).

**Non-Goals:**
- Not re-deriving or reimplementing `computeOpponentFactors`'s averaging/clamping logic — reused as-is.
- Not testing the player-prop or game-projection pipeline end to end — this isolates the opponent-factor computation itself, consistent with how `backtest-projection-methodology` isolated the season-average question from opponent/teammate adjustments.
- Not covering every stat type `computeOpponentFactors` could theoretically run on — scoped to the same `OPPONENT_ADJUSTABLE_STATS` list `ingest/generate-projections.ts` already uses (POINTS, REBOUNDS, ASSISTS, THREE_POINTERS_MADE, STEALS, BLOCKS, and the four combo stats), since those are the only ones the live pipeline actually computes factors for.
- Not a scheduled or production job — one-off/rerunnable analysis script, like its predecessor.

## Decisions

**Build each variant's `AllowedStatRow[]` input by filtering the same preloaded team-game history, then feed both through the unmodified `computeOpponentFactors`.**
- *Why*: guarantees the backtest measures exactly the averaging/fallback/clamp behavior that ships, not an approximation of it. Two variants:
  - `unscopedVariant`: every `TeamGameStat` row dated strictly before the game being predicted, regardless of season — matches `loadOpponentFactors()`'s current behavior.
  - `seasonScopedVariant`: only rows from games in the same season as the game being predicted, dated strictly before it.
- *Alternative considered*: hand-roll the average/fallback/clamp math a second time inside the backtest for clarity. Rejected — any divergence from `computeOpponentFactors`'s actual behavior (e.g. forgetting the `MIN_GAMES_FOR_FACTOR` fallback) would make the backtest's numbers not represent what shipping the fix would actually do.

**Preload all `TeamGameStat` rows (joined to game date/season) once, grouped by team, sorted ascending — same preload-then-walk-forward shape as the player backtest.**
- *Why*: 62,172 rows is small enough to hold in memory; avoids a query per team per historical game.

**Predicted "allowed value" for a game = `factor * leagueAverage`, both computed from the variant's historical rows as of that point, compared against what the opponent actually scored.**
- *Why*: `computeOpponentFactors` returns a multiplier, not a value — converting it back to a value (via the same league average the factor was computed against) is what makes it comparable to the actual recorded stat, mirroring how `loadOpponentFactors()`'s output is multiplied into a projection in production. The league average itself is also scoped per-variant (an unscoped league average for the unscoped variant, a season-scoped league average for the season-scoped variant), since that's what the live code does implicitly by passing one unscoped `rows` list into one `computeOpponentFactors` call.

**Segment by games-already-played-this-season bucket (e.g. 0-4, 5-14, 15+), not by team tenure.**
- *Why*: every team in this dataset has decades of history, so a "has prior-season data" tenure split (used in the player backtest) is meaningless here — every team qualifies. The dimension that actually matters is how much *current-season* data exists yet, which is exactly the `MIN_GAMES_FOR_FACTOR = 5` boundary the production clamp already cares about.

## Risks / Trade-offs

- [Risk] League-wide scoring pace has shifted over 24 seasons (measured: ~104 pts/team-game career average vs. ~114 this season), so the unscoped variant's league average is itself contaminated by the same era-mixing as the per-team average — both numerator and denominator move together, which could partially cancel out in the ratio rather than purely compound. → Mitigation: this is exactly why the backtest measures the *ratio's* predictive error directly (predicted value vs. actual value) rather than reasoning about the numerator and denominator separately — whatever net effect the era mixing has on the factor is what gets measured.
- [Risk] Expansion/relocation teams (ids reused or retired across the 2002-2026 span) could make "a team's history" ambiguous for the unscoped variant. → Mitigation: not solved here; `Team.id` is trusted as a stable identity the same way the live `loadOpponentFactors()` already trusts it, so the backtest's unscoped variant has the same (not worse) assumption as production.
- [Risk] Results could show the two variants are roughly equivalent in aggregate (the ratio-cancellation risk above dominating), which would mean this bug matters less in practice than the raw allowed-value numbers suggested. → Mitigation: report plainly either way, segmented by season-progress bucket, and let that evidence decide whether a follow-up fix is worth shipping, same posture as the player-level backtest.
