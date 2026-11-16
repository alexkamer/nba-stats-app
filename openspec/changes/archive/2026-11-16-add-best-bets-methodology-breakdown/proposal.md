# Proposal

## Why

`add-methodology-accuracy-breakdown` surfaced `byMethod` on the betting page, but it only covers `game`, `spread`, `total`, `props`, and `bettableProps` — the generic "every prop clearing a confidence bar" categories. It does not cover `bestBets` or `bestBetsCurrent`, the actual daily-selected Best Bets strip (top 8, one per player, the specific thing most people look at). The user noticed this: `bettableProps`'s 667 graded `v2-availability-aware` picks are every "recommended" prop across 14 days — not the much narrower, specifically-curated Best Bets selection, which deserves to be tracked by methodology version in its own right, separately from the broader recommended-props bucket.

The underlying rows already carry what's needed: `src/app/api/betting/accuracy/route.ts`'s `propRows` query already selects `method`, and the `bestBetsRows`/`bestBetsCurrentRows` arrays are built from rows derived from `propRows` — the `method` field is already in scope at the point each row is pushed, it's just not carried into the pushed row objects or passed to `accuracyByMethod`.

## What Changes

- Thread `method` through `bestBetsRows` and `bestBetsCurrentRows` in `src/app/api/betting/accuracy/route.ts`, and add `bestBets`/`bestBetsCurrent` entries to the `byMethod` response object, computed via the already-existing `accuracyByMethod`.
- Extend the betting page's `MethodologyBreakdown` component (and its `AccuracySummary.byMethod` type) to include these two new categories, using the same generic, no-hardcoded-tag-names rendering the rest of the section already uses.
- No change to how Best Bets themselves are selected or graded — this only adds a methodology-version breakdown of the already-computed Best Bets accuracy, the same way the other five categories already work.

## Capabilities

### Modified Capabilities
- `betting-insights-page`: the "Methodology version breakdown" requirement (added by `add-methodology-accuracy-breakdown`) extends to cover the Best Bets selection and its Current-line counterpart, not just the broader prop-recommendation categories.

## Impact

- `src/app/api/betting/accuracy/route.ts`: `bestBetsRows`/`bestBetsCurrentRows` gain a `method` field; `byMethod` gains `bestBets`/`bestBetsCurrent` keys.
- `src/app/betting/page.tsx`: `AccuracySummary.byMethod` type and `METHOD_CATEGORY_LABELS` extended.
- `src/lib/daily-best-bets-current.ts` / `getDailyBestBetCurrentSnapshot`: no change — `bestBetsCurrentRows`' `method` is looked up from `propRows` by `(gameId, playerId, statType)`, the same join key `actualValueByKey` already uses, since `DailyBestBetCurrent` itself has no `method` column.
- No database migration needed; no change to frozen historical rows.
