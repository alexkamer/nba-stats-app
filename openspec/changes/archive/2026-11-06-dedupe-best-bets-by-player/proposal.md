# Proposal

## Why

The betting page's "Best Bets" list ranks every player prop across every game purely by edge ratio, with no awareness that multiple stat lines for the same player (e.g. points, rebounds, and points+rebounds) are correlated outcomes. On nights where one player has unusually good or bad production, several of the day's 8 "best bets" slots can be filled by that single player, making the displayed win/loss record swing on one real event dressed up as multiple independent picks. This undermines trust in the record and concentrates risk in a way the feature doesn't currently surface.

## What Changes

- Add a shared best-bets selection function that deduplicates by player: when a player has more than one bettable prop on a given day, only their single highest-edge-ratio prop is eligible for the Best Bets pool.
- Remove no-longer-needed backfill-less slots: the Best Bets list may show fewer than 8 picks on a given day if fewer than 8 distinct players clear the bettable bar; it is never padded with a second pick from an already-selected player.
- Replace the two independent reimplementations of the selection logic (`BestBetsStrip` in `src/app/betting/page.tsx` and `src/app/api/betting/accuracy/route.ts`) with calls to the single shared selection function.
- **BREAKING**: Recompute the historical "Best Bets" accuracy record by re-running the new per-player-deduplicated selection rule over all previously graded days, rather than preserving the record as previously displayed. The displayed hit rate and graded count for "Best bets" will change (up or down) as a result.

## Capabilities

### New Capabilities

- `best-bets-selection`: Defines how the day's "Best Bets" picks are chosen from the pool of bettable player props — ranked by edge ratio, deduplicated to one pick per player, used identically by both the live display and the historical accuracy computation, with no backfill when the deduplicated pool is smaller than the display target.

### Modified Capabilities

(none — the existing `betting-insights-page` and `prediction-accuracy-tracking` specs describe the page's accuracy scoreboard and general grading in terms that remain true; they don't currently specify the Best Bets selection algorithm itself, which is why it is captured as a new capability rather than a modification.)

## Impact

- `src/app/betting/page.tsx` (`BestBetsStrip`): switch from its own flatMap/sort/slice to the shared selection function.
- `src/app/api/betting/accuracy/route.ts`: switch its day-bucketed replica of the selection logic to the same shared function; historical "Best bets" hit rate and graded count change as a result.
- New shared module (e.g. `lib/betting/select-best-bets.ts`, exact location decided in design) implementing the ranked, deduplicated selection.
- No database schema changes — selection remains a derived view over existing `PlayerPropProjection` rows.
