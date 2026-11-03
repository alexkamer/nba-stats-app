# Proposal

## Why

The team-game-performance-tracking capability already computes, per final game with a recorded spread, each team's cover margin, qualitative label, and reason tags (star out, early blowout, late collapse, garbage-time swing, hot/cold shooting). Today that data only surfaces on the team Performance tab (`src/components/TeamPerformanceTab.tsx`), which a user has to navigate to separately and then find the one row for the game they're already looking at. A user viewing a specific game's detail page has the spread right in front of them (the Gamecast tab's Odds panel) but no way to see how either team actually graded against it or why.

## What Changes

- Add a "Performance vs. the spread" card to the game detail page's Gamecast tab (final games only), alongside the existing Odds panel, showing both teams' cover margin, qualitative label, and reason tags for that game.
- Add this data to the game detail API response (`src/app/api/games/[eventId]/route.ts`) by reading the game's existing `TeamGamePerformance`/`TeamGamePerformanceTag` rows — no new computation, just surfacing rows the ingest pipeline already writes.
- When the game has no `TeamGamePerformance` rows (no recorded spread, not yet graded, or not a regular-season final), omit the card entirely rather than showing an empty or broken state.

## Capabilities

### New Capabilities
- `game-performance-context`: surfaces a specific game's already-computed cover margin, label, and reason tags (owned by `team-game-performance-tracking`) on that game's detail page.

### Modified Capabilities
None. `team-game-performance-tracking` and `team-performance-views` are read-only dependencies — this change reads their persisted data and does not change how it is computed or how the team Performance tab or leaderboard work.

## Impact

- **API**: `src/app/api/games/[eventId]/route.ts` — add both teams' `TeamGamePerformance` rows (with tags) to the FINAL-game branch's response.
- **UI**: `src/app/games/[eventId]/page.tsx` — new card in the Gamecast tab's final-game layout, near `OddsPanel`. Reuses existing display helpers from `src/components/performance-display.tsx` (label pills, tag text, margin formatting).
- **Dependencies on existing data**: depends entirely on `TeamGamePerformance` rows already existing for a game (see `team-game-performance-tracking`'s idempotent, post-game-final computation). No new ingest, schema, or background job.
