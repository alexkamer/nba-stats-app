# Proposal

## Why

Three projection-methodology changes shipped this session (`fix-player-projection-season-scope`, `fix-opponent-factor-season-scope`, `tune-minutes-trend-clamp`), each bumping `PROP_METHOD` specifically so real-world performance could be compared before vs. after via `lib/accuracy/compute-accuracy.ts`'s `accuracyByMethod`. That function is already called and its output (`byMethod`) is already returned by `/api/betting/accuracy` — but no page reads it. The only way to see the comparison today is to query the API or database directly, which defeats the point of tagging methodology versions in the first place: nobody can actually see whether a methodology change helped without asking an engineer to run a query.

## What Changes

- Add a "Methodology history" section to the betting insights page, rendering the already-computed `byMethod` breakdown — for each accuracy category that has it (game, spread, total, props, bettableProps), show each distinct `method` tag's graded count, hit rate, and correct count, so a methodology change's real-world before/after can be seen directly on the page.
- Generic over whatever method tags are actually present — not hardcoded to today's three tags, since more will accumulate over time and old ones should keep showing without a code change.
- Read-only presentation of already-computed data; no new grading logic, no new database queries beyond what `/api/betting/accuracy` already does.
- Omit any category/method combination with zero graded picks, consistent with the page's existing no-data-fallback conventions.

## Capabilities

### Modified Capabilities
- `betting-insights-page`: adds a "Methodology version breakdown" requirement alongside the existing "Accuracy scoreboard" requirement — a different axis (methodology version over time) from the existing scoreboard's axis (prediction source: our model vs. ESPN vs. market favorite).

## Impact

- `src/app/betting/page.tsx`: add `byMethod` to the `AccuracySummary` client-side type (currently not typed or read at all, despite the API already returning it) and render a new section.
- `src/app/api/betting/accuracy/route.ts`: no change — `byMethod` is already computed and returned.
- No new backend/database work; no schema change.
