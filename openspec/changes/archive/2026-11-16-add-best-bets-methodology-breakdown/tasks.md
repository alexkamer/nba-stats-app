# Tasks

## 1. Thread `method` through Best Bets accuracy rows

- [x] 1.1 In `src/app/api/betting/accuracy/route.ts`, add `method: row.method` to the object pushed into `bestBetsRows` (both the snapshot branch and the `selectBestBets` fallback branch), and update its type annotation to include `method: string`. Verify by confirming via the live API (or a temporary console log) that pushed rows carry a non-empty `method` string matching known tags (e.g. `v1-recency-weighted`, `v2-availability-aware`).

  Verified: live `byMethod.bestBets` returned both `v1-recency-weighted` (24 graded) and `v2-availability-aware` (100 graded).
- [x] 1.2 Build a `methodByKey` map from `propRows` (same shape/pattern as the existing `actualValueByKey`, keyed by `` `${gameId}|${playerId}|${statType}` `` mapping to `method`), and use it to add `method` to each pushed `bestBetsCurrentRows` entry, skipping a pick if no match is found (same defensive pattern `actualValueByKey`'s `undefined` check already uses). Verify the same way as 1.1.

  Verified: live `byMethod.bestBetsCurrent` returned `v2-availability-aware` (40 graded).
- [x] 1.3 Add `bestBets: accuracyByMethod(bestBetsRows, (r) => r.correct)` and `bestBetsCurrent: accuracyByMethod(bestBetsCurrentRows, (r) => r.correct)` to the `byMethod` object returned at the end of the route, and verify by hitting `/api/betting/accuracy` live and confirming `byMethod.bestBets` and `byMethod.bestBetsCurrent` are present with method-tag keys and non-zero `graded` counts for at least one tag.

  Verified via the same live curl above.

## 2. Surface the two new categories on the betting page

- [x] 2.1 In `src/app/betting/page.tsx`, extend `AccuracySummary["byMethod"]`'s key union to include `"bestBets" | "bestBetsCurrent"`, and add `bestBets: "Best Bets"` / `bestBetsCurrent: "Best Bets (current line)"` to `METHOD_CATEGORY_LABELS`. Verify by running the type checker (`npx tsc --noEmit`) and confirming no new errors.

  Verified: `npx tsc --noEmit` passes clean.
- [x] 2.2 Run the dev server, visit `/betting`, expand "Full track record" → "Methodology history", and confirm two new tables appear (Best Bets, Best Bets (current line)) alongside the existing five, each showing per-method-tag hit rates — verifying the existing generic rendering picks up the new categories with no component changes beyond the label map.

  Verified via the live API instead of a screenshot (an automated browser-scenario attempt hit an unrelated tooling/network issue earlier this session): `bestBets` now has 2 qualifying method tags (`v1-recency-weighted` 24 graded, `v2-availability-aware` 100 graded) and will render. `bestBetsCurrent` currently has only 1 qualifying tag (`v2-availability-aware`, 40 graded) — correctly omitted by the existing `>= 2` filter, matching the spec's "only one methodology version has graded picks" scenario exactly rather than being a bug. `/betting` still returns 200.

## 3. Regression check

- [x] 3.1 Run the full existing test suite (`npx tsx --test` over every `*.test.ts` under `lib/` and `ingest/`) and confirm all tests still pass.

  Verified: 183/183 tests pass.
- [x] 3.2 Run the linter on the two changed files and confirm no new warnings/errors beyond the already-known pre-existing one in `src/app/betting/page.tsx` (`react-hooks/set-state-in-effect`, unrelated to this change).

  Verified: only the pre-existing error appeared; `route.ts` is clean.

## Workflow follow-up

- Once `v3-season-scoped` and `v4-tuned-minutes-trend` Best Bets have graded picks, this is what makes their real-world performance visible specifically for the daily-selected Best Bets, not just the broader recommended-props bucket.
- Archive this change once the above verification is complete.
