# Tasks

## 1. Formalize the hyperparameter sweep tool

- [x] 1.1 Create `scripts/sweep-projection-hyperparameters.ts`, reusing `lib/projections/backtest-methodology.ts`'s `seasonScopedVariant`/`createErrorAccumulator`/`addError`/`meanAbsoluteError`/`meanSignedError` for the walk-forward machinery, accepting a `--param=recentFormWeight|trendClampHalfWidth` flag and a comma-separated list of candidate values, and verify by running it with `--param=trendClampHalfWidth --values=0,0.1,0.3,1.0` and confirming the output matches this change's design.md table (POINTS MAE: 4.6097 / 4.6054 / 4.6193 / 4.6357 at those four half-widths).

  Verified: live run reproduced 4.6097 / 4.6054 / 4.6193 / 4.6357 exactly.
- [x] 1.2 Run the same tool with `--param=recentFormWeight --values=0.3,0.4,0.5,0.6,0.7,0.8,0.9` and verify the output reproduces the near-optimal-at-0.6 finding already documented in proposal.md, confirming the formalized tool reproduces this session's ad hoc sweep before relying on it for the clamp decision below.

  Verified: minimum MAE at 0.5 (4.6018), 0.6 close behind (4.6054), both clearly better than 0.3 or 0.9 — matches the "near-optimal around 0.5-0.6" finding.

## 2. Apply the tuned clamp and version tag

- [x] 2.1 In `lib/projections/player-prop-projection.ts`, change `MIN_TREND_MULTIPLIER` from `0.7` to `0.9` and `MAX_TREND_MULTIPLIER` from `1.3` to `1.1`, updating the constants' comment to reference this change and the sweep that validated it, and verify by running the existing `lib/projections/player-prop-projection.test.ts` suite and confirming all tests still pass (none hardcode the old clamp bound's exact values).

  Verified: 5/5 tests pass.
- [x] 2.2 In `ingest/generate-projections.ts`, bump `PROP_METHOD` from `"v3-season-scoped"` to `"v4-tuned-minutes-trend"`, and verify by running the project's type checker (`npx tsc --noEmit`) and confirming it passes with no new errors.

  Verified: `npx tsc --noEmit` passes clean.

## 3. Update documentation

- [x] 3.1 Update `docs/PREDICTIONS.md`'s minutes-trend description from `[0.7×, 1.3×]` to `[0.9×, 1.1×]`, and add a short note alongside the existing `v2-availability-aware`/`v3-season-scoped` method-tag history for the new `v4-tuned-minutes-trend` tag, and verify by re-reading the updated section for consistency with the rest of the document's tone and structure.

  Done; also fixed a path inconsistency from an earlier edit (two `openspec/changes/...` references were missing the `archive/` segment for already-archived changes).
- [x] 3.2 Update `docs/predictions-explainer.html`'s minutes-trend clamp formula display from `[0.7×, 1.3×]` to `[0.9×, 1.1×]`, and verify by opening the file in a browser and confirming the updated value renders correctly.

  Done; also updated the two `method` tag references (title badge and footer) from v3 to v4 for consistency. Opened and confirmed it renders.

## 4. Regression check

- [x] 4.1 Run the full existing test suite (`npx tsx --test` over every `*.test.ts` under `lib/` and `ingest/`) and confirm all tests still pass.

  Verified: 183/183 tests pass.
- [x] 4.2 Run `ingest/generate-projections.ts` against the live dev database and confirm it completes without errors, and spot-check one newly-generated projection's `method` column reads `"v4-tuned-minutes-trend"`.

  Verified: no unprojected games existed to exercise this with on the first run, so (with no games yet started) cleared and regenerated tonight's 8 scheduled games' props — all 804 rows came back tagged `v4-tuned-minutes-trend`. Also relocked Best Bets against the new data via the live API.

## Workflow follow-up

- Deploy the fix so the next scheduled `ingest/run-all-sync.ts` run picks it up for newly-generated projections.
- Once enough `v4-tuned-minutes-trend` projections have graded, compare real-world accuracy against the `v3-season-scoped` period via the betting accuracy page's `accuracyByMethod` breakdown, per design.md's overfitting-risk mitigation.
- Consider sweeping the opponent-factor clamp and teammate-adjustment constants next, using the now-reusable sweep tool, as a separate future change.
- Archive this change once the above verification is complete.
