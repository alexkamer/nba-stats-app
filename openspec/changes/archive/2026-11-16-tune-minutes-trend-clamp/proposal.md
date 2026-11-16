# Proposal

## Why

With `fix-player-projection-season-scope` and `fix-opponent-factor-season-scope` shipped and validated (32/32 season/stat comparisons improved), the remaining prediction error comes from hand-picked constants that were never empirically validated — `lib/projections/player-prop-projection.ts`'s own comments call them "unvalidated placeholders." A quick hyperparameter sweep against the last 4 completed regular seasons (~105,000 scored player-games, reusing the already-season-scoped methodology) checked two of them:

- **`RECENT_FORM_WEIGHT` (currently 0.6)**: MAE is minimized around 0.5-0.6 for every tracked stat, with a bias/accuracy tradeoff above that — the current value is already near-optimal. No change proposed.
- **The minutes-trend multiplier's clamp (currently `[0.7, 1.3]`, i.e. ±30%)**: MAE is minimized at a much tighter `[0.9, 1.1]` (±10%) clamp for every single tracked stat type, and that tighter clamp even slightly beats disabling the trend adjustment entirely. The current ±30% clamp lets a player's recent minutes trend swing the projection further than the data supports. Example: POINTS MAE drops from 4.6193 (current ±30%) to 4.6054 (±10%) across 105,067 scored player-games.

The magnitude is small (~0.3% MAE) but consistent across every stat type with no exceptions — the same kind of clean, broad signal that justified the two prior fixes, just smaller in size.

## What Changes

- Tighten `MIN_TREND_MULTIPLIER`/`MAX_TREND_MULTIPLIER` in `lib/projections/player-prop-projection.ts` from `0.7`/`1.3` to `0.9`/`1.1`.
- No change to `RECENT_FORM_WEIGHT`, `MIN_RECENT_GAMES_FOR_BLEND`, `TREND_WINDOW_GAMES`, or any opponent-factor/teammate-adjustment constant — the sweep only covered the minutes-trend clamp and the blend weight, and only the clamp showed room for improvement.
- Formalize the ad hoc sweep used to find this value into a reusable script, so future hyperparameter tuning doesn't start from scratch and stays using the correct (already season-scoped) methodology as its baseline.
- Bump `PROP_METHOD` to a new version tag, per the user's request to track this as its own distinguishable model version in `accuracyByMethod` — this is a tuning change to projection *values*, not just a bug fix, and deserves the same before/after separability the two season-scoping fixes got.
- Already-persisted `PlayerPropProjection` rows are frozen and not recomputed; this only affects projections generated after the fix ships.

## Capabilities

### Modified Capabilities
- `betting-projections`: adds a "Minutes trend adjustment" requirement — this behavior already exists in code but was never captured as its own spec requirement (the current `betting-projections` spec doesn't mention minutes-trend at all); this proposal both documents it for the first time and tightens its bound.

## Impact

- `lib/projections/player-prop-projection.ts`: `MIN_TREND_MULTIPLIER`/`MAX_TREND_MULTIPLIER` constants change.
- `ingest/generate-projections.ts`: `PROP_METHOD` version bump.
- New script (exact location decided in design.md) formalizing the hyperparameter sweep.
- `docs/PREDICTIONS.md` and `docs/predictions-explainer.html` both state the current `[0.7, 1.3]` clamp and need updating to match.
- No database migration needed; no change to frozen historical rows.
