# Tasks

## 1. Shared selection function

- [x] 1.1 Add `selectBestBets(props, limit)` in a new `lib/betting/` module: sort candidates by `edgeRatio` descending, dedupe by `playerId` keeping each player's first (highest-edge) entry, then slice to `limit`; no backfill when fewer than `limit` distinct players remain. Verify with unit tests covering: a single player with multiple bettable props keeps only the highest-edge one, a day with fewer than `limit` distinct qualifying players returns a shorter array, and a day with more than `limit` distinct players returns exactly `limit` picks ranked correctly.

## 2. Live Best Bets display

- [x] 2.1 Update `BestBetsStrip` in `src/app/betting/page.tsx` to call `selectBestBets` instead of its inline flatMap/sort/slice. Verify by running the betting page locally and confirming the strip renders correctly both on a day with many qualifying players and (if reachable in current data) a day with few.
- [x] 2.2 Confirm `BestBetsStrip`'s rendering does not assume exactly `BEST_BETS_PER_DAY` items (e.g. no hardcoded grid slots or index-based keys). Verify by rendering with a shorter array in a manual/local check and confirming no empty placeholder slots or layout breakage.

## 3. Historical accuracy recomputation

- [x] 3.1 Update `src/app/api/betting/accuracy/route.ts` to call `selectBestBets` per day instead of its own inline sort/slice, so the "Best bets" accuracy bucket is derived from the same deduplicated selection as the live strip. Verify by hitting the route locally and confirming the per-day selection matches `selectBestBets`'s output for a sample day's data.
- [x] 3.2 Verify the full historical "Best bets" hit rate and graded count displayed in `AccuracyStrip` change to reflect the deduplicated recomputation (compare before/after values for the current dataset) and confirm no runtime errors occur across the full history of graded days.
