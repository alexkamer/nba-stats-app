# Design

## Context

`lib/projections/player-prop-projection.ts`'s `minutesTrendMultiplier` already implements the behavior being specified here — it's existing code, not new. `MIN_TREND_MULTIPLIER = 0.7` / `MAX_TREND_MULTIPLIER = 1.3` are the constants being tuned, each already documented in-code as a guess ("Trend multiplier is clamped so a tiny sample ... can't swing the projection wildly") rather than a fitted value.

The sweep that motivated this change reused `lib/projections/backtest-methodology.ts`'s `seasonScopedVariant` (the already-shipped, correct season-scoping) to build inputs, then applied a parameterized copy of the blend/trend formula across the last 4 completed regular seasons (~105,000 scored player-games) to see where MAE/bias land as the clamp width varies. Results (half-width = distance from 1.0 in either direction; current production is 0.3):

| Half-width | POINTS MAE | REBOUNDS MAE | PTS+REB+AST MAE |
|---|---|---|---|
| 0 (disabled) | 4.6097 | 1.9131 | 6.1090 |
| **0.1** | **4.6054** | **1.9098** | **6.0920** |
| 0.3 (current) | 4.6193 | 1.9162 | 6.1180 |
| 1.0 | 4.6357 | 1.9255 | 6.1472 |

0.1 is the minimum for every tracked stat; error rises monotonically on both sides of it in this data.

## Goals / Non-Goals

**Goals:**
- Tighten the minutes-trend clamp to the empirically-minimizing bound (±10%, i.e. `[0.9, 1.1]`).
- Make the sweep methodology reusable so retuning (or re-validating after a future season-scoping-style fix) doesn't require writing a new one-off script each time.
- Track this as its own distinguishable methodology version, per the user's request, so its real-world performance can be compared against `v3-season-scoped` the same way that was compared against `v2-availability-aware`.

**Non-Goals:**
- Not touching `RECENT_FORM_WEIGHT` — the sweep showed the current 0.6 is already near the MAE-minimizing value, with a bias/accuracy tradeoff on either side of it that doesn't clearly favor a different choice.
- Not sweeping the opponent-factor clamp `[0.85, 1.15]` or `MIN_GAMES_FOR_FACTOR`/teammate-adjustment constants — out of scope for this change; a natural next candidate for the same reusable sweep tool, not bundled in here.
- Not re-deriving `computeStdev` or the `isBettable`/edge-ratio threshold — the clamp change only affects `projectedValue`, not the variance estimate or bettability gate, so Best Bets selection logic is unaffected by this change beyond picks naturally shifting from the new projected values.
- Not backfilling or recomputing any already-persisted projection row, consistent with the prior two fixes.

## Decisions

**Change the constants directly in `lib/projections/player-prop-projection.ts` rather than making the clamp configurable.**
- *Why*: consistent with this module's existing style — every other constant here (`RECENT_FORM_WEIGHT`, `MIN_RECENT_GAMES_FOR_BLEND`, the opponent-factor clamp, the teammate-adjustment clamp) is a hardcoded, commented constant, not a runtime parameter. Introducing configurability for just this one constant would be inconsistent and is unnecessary — retuning again later means editing a number and re-running the sweep, the same workflow this change itself followed.

**Formalize the sweep as `scripts/sweep-projection-hyperparameters.ts`, built on top of `lib/projections/backtest-methodology.ts`'s existing exports (`seasonScopedVariant`, `createErrorAccumulator`, `addError`, `meanAbsoluteError`, `meanSignedError`) rather than duplicating the walk-forward/preload logic from `scripts/backtest-projection-methodology.ts`.**
- *Why*: the walk-forward machinery (preload per-player logs, walk forward with no look-ahead, season-scope via `seasonScopedVariant`) is identical to the existing backtest script; only the thing being varied differs (a hyperparameter value instead of a whole methodology). Reusing the existing exports avoids a second copy of that machinery.
- Shape: accepts a stat-type list and a named parameter to sweep (`recentFormWeight` or `trendClampHalfWidth` for now, extensible to others later) plus a list of candidate values, reports MAE/bias per candidate per stat type — directly generalizing both of this session's ad hoc sweep scripts into one reusable, parameterized tool instead of two throwaway ones.
- *Alternative considered*: extend `scripts/backtest-projection-methodology.ts` itself to also sweep hyperparameters. Rejected — that script's job (per its own spec, `projection-methodology-backtesting`) is comparing named *methodology variants* against each other; a hyperparameter sweep is a different shape of question (one methodology, many values of one constant) and conflating the two would make both harder to read.

**Bump `PROP_METHOD` to `"v4-tuned-minutes-trend"`.**
- *Why*: matches the precedent set by `fix-player-projection-season-scope` (`v2-availability-aware` → `v3-season-scoped`) — a change to projection *values*, not just a true/false bug, still deserves its own tag so `accuracyByMethod` can show whether real-world performance actually improved, rather than assuming the backtest's offline result transfers perfectly to live odds and outcomes.
- *Alternative considered*: leave the tag as `v3-season-scoped` since this is "just a constant tweak." Rejected per the user's explicit request to track this as a distinguishable version, and because the whole point of the `method` column is to not rely on "this one's probably fine" when grading history.

## Risks / Trade-offs

- [Risk] The sweep optimizes against the same 4 seasons used to validate the two prior fixes — there's no held-out season the clamp wasn't tuned against, so this could be a mild overfit to this specific historical window rather than a universally better bound. → Mitigation: the effect is consistent across 4 independent seasons and 4 different stat types (16 combinations, no exceptions), not fit to one slice; and the magnitude is small enough that even a modest overfit wouldn't meaningfully hurt real outcomes. Real-world `v4-tuned-minutes-trend` performance should still be compared against `v3-season-scoped` once enough new picks grade, per the Workflow follow-up.
- [Risk] A tighter clamp means a player with a genuinely large, sustained minutes change (e.g. moving into a starting role) gets less credit for it than before. → Mitigation: the minutes-trend adjustment is one signal among several (recent-form blend already weights recent games 60%, and a sustained role change shows up in `recentValues` directly, not just the trend multiplier) — this isn't the only mechanism by which a real role change reaches the projection.
- [Risk] Two near-identical hyperparameter-sweep scripts already exist as throwaway `/tmp` scripts from this session's exploration, informally. → Mitigation: this change formalizes one reusable version in the repo; the throwaway scripts are not committed anywhere and can be ignored/discarded.

## Migration Plan

1. Ship the constant change and method-tag bump together in one deploy — no intermediate state to support.
2. No database migration required (no schema change).
3. Next scheduled run of `ingest/run-all-sync.ts` picks up the fix automatically for newly-generated projections; already-frozen rows are unaffected.
4. Rollback is a plain revert of the two constants and the method tag; no data cleanup needed either direction.
