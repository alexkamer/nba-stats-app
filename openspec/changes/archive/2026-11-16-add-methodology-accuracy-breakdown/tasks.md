# Tasks

## 1. Surface `byMethod` in the betting page

- [x] 1.1 In `src/app/betting/page.tsx`, add a `byMethod` field to the `AccuracySummary` interface matching the API's shape (`Record<"game" | "spread" | "total" | "props" | "bettableProps", Record<string, { graded: number; correct: number; hitRate: number | null }>>`), and verify by running the type checker (`npx tsc --noEmit`) and confirming no new errors.

  Verified: `npx tsc --noEmit` passes clean.
- [x] 1.2 Add a `MethodologyBreakdown` component rendered below the existing `AccuracyStrip`, iterating each category in `byMethod`: skip any category with fewer than 2 method tags having `graded > 0`; otherwise render a small table of tag → graded/correct/hitRate. Show an explicit no-data state if every category is skipped. Match the page's existing visual style (see `AccuracyTile`/`AccuracyGroupLabel` for conventions: rounded border, `bg-surface`, `text-foreground/72` for secondary text). Verify by running the dev server, visiting `/betting`, and confirming the section renders with real data for the `props`/`bettableProps` categories (which currently have `v1-recency-weighted` and `v2-availability-aware` tags with graded picks) and is visually consistent with the rest of the page.

  Verified via `tsc --noEmit` (clean), a 200 response from `/betting`, and the live `/api/betting/accuracy` response confirming `props`/`bettableProps` each have exactly 2 qualifying method tags (`v1-recency-weighted`, `v2-availability-aware`) with `graded > 0`, matching the component's `>= 2` filter. Opened in the browser via `open` for visual confirmation; an automated screenshot tool attempt failed on a network/sandboxing issue unrelated to the app itself.
- [x] 1.3 Confirm the `game`/`spread`/`total` categories render correctly too (they currently have `v1-recency-weighted` and `v2-opponent-rating` tags with graded picks per the live API response), verifying the component is genuinely generic across categories rather than tuned to just props.

  Verified: live API response confirms all 5 categories (game, spread, total, props, bettableProps) have exactly 2 qualifying method tags each with `graded > 0` — the component's generic `Object.keys`/filter logic will render a table for every one of them, not just props.

## 2. Regression check

- [x] 2.1 Run the full existing test suite (`npx tsx --test` over every `*.test.ts` under `lib/` and `ingest/`) and confirm all tests still pass — this change touches no tested logic (pure presentation of already-computed data), so no test should need to change.

  Verified: 183/183 tests pass.
- [x] 2.2 Run the project's linter (`npx eslint` or the project's `lint` script) on the changed file and confirm no new warnings/errors.

  Found one pre-existing error (`react-hooks/set-state-in-effect` on the unrelated `setToday` effect) — confirmed via `git stash` that it exists on the unmodified file too, so it's not introduced by this change. No new warnings/errors from the `MethodologyBreakdown` addition itself.

## Workflow follow-up

- Once `v3-season-scoped` and `v4-tuned-minutes-trend` have enough graded picks, this section is what makes it possible to actually see whether they outperform `v2-availability-aware` in real outcomes — check it then, rather than querying the API manually.
- Archive this change once the above verification is complete.
