# Proposal

## Why

The player prop research page (`/betting/research/[playerId]`) and the betting insights page (`/betting`) currently present their data as prose tables and a single-stat chart, which forces repeated stat-switching to see a player's full picture and duplicates the same picks across two separate tables on `/betting`. A denser, scan-first grid layout — in the style of props.cash/Linemate — surfaces more of a player's hit-rate history at once and removes the duplication, without changing what data either page already shows.

## What Changes

- Research page: add a dense hit-rate grid as the primary view — rows are recent games, columns are the player's tracked stat types, each cell shows the game's actual value tinted by over/under/push result against that game's line for that stat. Season/L5/L10/L20 hit-rate chips sit above the grid.
- Research page: demote the existing SVG trend chart to a secondary, single-stat detail view shown for whichever stat column the user selects in the grid, rather than being the page's main element.
- Research page: compress the hero banner from a full-bleed gradient/headshot banner into a slim, sticky header (small headshot/logo, name, opponent, today's line) so more of the grid stays above the fold while scrolling.
- Betting page (`/betting`): fold the standalone "Recommended picks" cross-game table into each `GameCard` as inline tinted badges/marks on the relevant row/cell, removing the separate table so a pick and the game/prop it belongs to are shown together once.
- Shared styling: introduce a new tinted-cell/grid primitive for hit/miss coloring; existing shared components (`SectionCard`, `SegmentedToggle`, accent system) are reused as-is and not restyled, to avoid regressing other pages.

## Capabilities

### New Capabilities

(none — this reshapes how two existing capabilities present data already described by their specs)

### Modified Capabilities

- `player-prop-research-page`: adds a multi-stat hit-rate grid as the primary history view (previously the chart was the only view, requiring a stat switch to see other stats) and changes the per-stat chart to a secondary, on-demand view; the sticky compact header replaces the full-bleed hero while keeping the same information available.

## Impact

- `src/app/betting/research/[playerId]/page.tsx`: replace/restructure `HistoryChart`-first layout with a new grid-first layout; demote `HistoryChart`; compress the hero section into a sticky header.
- `src/app/betting/page.tsx`: remove the standalone `RecommendedPicksTable` component/usage; extend `GameCard` (and its player-props table) to carry the same "recommended pick" signaling inline.
- `src/app/api/betting/research/[playerId]/route.ts`: likely needs to return hit-rate/value data for all of a player's tracked stat types at once (not just the selected one) to populate the grid — to confirm in design.
- No change to `src/app/api/betting/upcoming/route.ts` response shape expected (all data needed for the inline badges is already present per game/prop).
- No database schema changes.
