# Design

## Context

Two client components drive this change:

- `src/app/betting/research/[playerId]/page.tsx` renders one stat at a time (`statType` state), backed by `GET /api/betting/research/[playerId]` (`src/app/api/betting/research/[playerId]/route.ts`), which only computes `history`/`hitRates` for the single selected `statType`. Switching stats re-fetches.
- `src/app/betting/page.tsx` renders `RecommendedPicksTable` (cross-game, all pick kinds) and a stack of `GameCard`s (per-game table + player-props table), both built client-side from `GET /api/betting/upcoming`, which already returns full per-prop data (`bettable`, `lean`, `odds`, `projectedValue`, `gradedCorrect`) needed for inline badges. No API change needed for `/betting`.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Research page shows all of a player's live tracked stats at once in one grid, with the existing chart available as an on-demand per-stat detail.
- `/api/betting/research/[playerId]` returns enough data to render that grid without one request per stat.
- `/betting` shows the same "recommended pick" signal already in `RecommendedPicksTable` inline on `GameCard`, so the table can be removed without losing information.
- Reuse existing shared primitives (`SectionCard`, `SegmentedToggle`/`TabList`, `getTeamAccent`, `computeEdgeRatio`) unchanged; add one new grid/cell primitive.

**Non-Goals:**
- No change to how projections or hit rates are computed (`lib/projections/*`), only to what's returned/rendered.
- No change to `/api/betting/upcoming` response shape.
- No visual restyle of pages outside `/betting` and `/betting/research/[playerId]`.
- No change to the home/away/opponent filter semantics on the research page.

## Decisions

**1. Compute all live stat types' history server-side, in one response.**
`rowsForStat`/`fullHistory` in the research route currently filter/grade against a single `statType`'s line. Change this to loop `liveStatTypes` and, for each, derive that stat's own `line` (from its own over/under `PlayerPropOdds` rows, same logic as today) and map `historyRows` to `{ value, result }` using `extractStatValue(stat, row)` graded against that stat's own line. The response gains a `grid` field: one row per historical game (already fetched once, independent of stat), one cell per live stat type `{ statType, value, result }`. `history`/`hitRates`/`line`/`odds`/`projection` stay keyed to the currently-selected `statType` as today, so the existing per-stat chart and summary tiles need no reshaping — only `grid` is new.
*Alternative considered*: have the client fetch all `otherStatTypes` in parallel via separate requests and assemble the grid client-side. Rejected — `historyRows` and the home/away/opponent filter are identical across stats, so computing all stats in the one existing query avoids N redundant fetches and keeps grading logic in one place (the route), matching where `compareToLine`/`summarizeWindow` already live.

**2. Grid cells with no live line for that column render the value unmarked.**
A player can have a live prop today for POINTS but not BLOCKS; `extractStatValue` can still compute a historical BLOCKS value, but there's no line to grade it against. Per the new "Stat column has no live line today" scenario, those cells carry `result: null` (reusing the existing `PropResult | null` shape already used in `HistoryGame`) and the grid component renders them as plain, unhighlighted values.

**3. Grid is a new component; existing `HistoryChart` is kept, demoted.**
Add a `HitRateGrid` component (new file or co-located in the page, matching the existing pattern of page-local components like `HistoryChart`/`HitRateChip`). It becomes the primary element under the header; `HistoryChart` renders below it (or in a collapsible/tab-selected section) for the stat column the user last interacted with in the grid, reusing the existing `statType` state rather than adding new state.

**4. Sticky header is a CSS-only change.**
Compress the existing hero's content (logo/headshot shrink, drop the full-bleed gradient strip) and apply `sticky top-0` (with the app's existing header/nav z-index conventions) to the container. No new data is needed — everything the sticky header shows (`player.displayName`, `opponent.abbreviation`, `line`) is already in `ResearchData`.

**5. `/betting`: fold `RecommendedPicksTable` into `GameCard`.**
`BettableMark`/`ResultMark` already render per-pick in `GameCard`'s own tables (spread/total row, player-props grid) using the same `bettable`/`gradedCorrect` fields `buildRecommendedPicks` reads. Remove `RecommendedPicksTable` and its `buildRecommendedPicks` call from `BettingPage`; no new badge logic is needed since `GameCard` already marks bettable picks — this is a deletion plus confirming `GameCard`'s existing marks remain visually prominent enough to stand alone (e.g., keep `BettableMark`'s accent dot, consider a subtle row/cell background tint on bettable rows so a scan across cards still surfaces the same picks a dedicated table did).

## Risks / Trade-offs

- **Grid payload size** → `grid` adds one small object per historical game per live stat type (typically 2-6 stat types, up to full season of games). Mitigate by only computing `grid` for the stat types in `liveStatTypes` (already the smallest relevant set) and capping rendered grid rows client-side the same way `HistoryChart` already caps at `CHART_GAMES`.
- **Losing the cross-game "all picks ranked by confidence" view** when `RecommendedPicksTable` is removed → a user could previously sort all of today's bettable picks by edge in one place; per-`GameCard` badges don't offer that ranking. Accepted per proposal's explicit scope (fold into cards); if this is missed in practice, a future change can reintroduce a compact "jump to best picks" list that links into cards rather than duplicating their data.
- **Sticky header overlap with the app's own global nav** → verify the research page's sticky offset doesn't collide with any existing sticky site header (check current layout) before shipping; use `top-<nav height>` rather than `top-0` if the site has a persistent nav bar.

## Open Questions

- None — the grid's data shape, header behavior, and `/betting` consolidation are all decided above.
