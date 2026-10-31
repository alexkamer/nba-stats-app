# Tasks

## 1. Research API: return a multi-stat grid

- [x] 1.1 In `src/app/api/betting/research/[playerId]/route.ts`, compute a `line`/`result` pair per stat type in `liveStatTypes` (reusing `compareToLine`/`extractStatValue`), and add a `grid` field to the response: one row per historical game (filtered by the same home/away/opponent filter as `history`, for consistency with everything else the filter affects), each with a `cells` array of `{ statType, value, result }` across all `liveStatTypes`, `result: null` when that stat type has no live line today. Verify via `curl localhost:3000/api/betting/research/<id>` (or a route test) that `grid` includes every live stat type's column and that a stat with no live line returns `result: null` cells.
- [x] 1.2 Confirm the existing `history`/`hitRates`/`line`/`odds`/`projection` fields (keyed to the selected `statType`) are unchanged by the above, so the current chart/tiles keep working without modification. Verify by diffing the response for an existing player/stat before and after 1.1 — only `grid` should be new.

## 2. Research page: hit-rate grid as primary view

- [x] 2.1 Add a `HitRateGrid` component in `src/app/betting/research/[playerId]/page.tsx` that renders `grid` as rows (games) by columns (live stat types), each cell showing the value tinted via the existing `resultColor` helper, unmarked when `result` is `null`. Verify by loading `/betting/research/<id-with-a-live-prop>` and confirming all of that player's live stat types appear as columns in one view, each cell colored per `resultColor`.
- [x] 2.2 Place `HitRateGrid` above `HistoryChart` as the page's primary element; keep the L5/L10/L20/season `HitRateChip`s for the currently-selected stat as today. Verify by confirming a player with 2+ live props shows all of them in the grid without needing the `TabList` stat switch.
- [x] 2.3 Wire grid column header clicks (or existing `TabList`) to update the `stat` state so `HistoryChart` and the hit-rate chips reflect the clicked/selected stat. Verify by clicking a different stat column and confirming the chart below and the chips update to that stat without a page navigation.
- [x] 2.4 Cap grid rows the same way `HistoryChart` caps at `CHART_GAMES`, and handle the empty-grid case (no historical games) with the same empty-state convention `HistoryChart` already uses. Verify by checking a player with 0 historical `PlayerGameStat` rows renders an explicit empty state, not a blank/broken grid.

## 3. Research page: compact sticky header

- [x] 3.1 Replace the full-bleed gradient hero in `PlayerPropResearchContent` with a compact header (small headshot/logo, name, opponent, active stat's line) and apply `position: sticky` at the top of its scroll container. Verify by scrolling the page and confirming the header stays visible with name/opponent/line intact.
- [x] 3.2 Verify there is no other sticky/fixed element on the page (confirmed absent in `src/app/layout.tsx`/`src/components` during design) that the new sticky header would overlap; re-check after this task's edits specifically, since a layout change elsewhere in this same effort could introduce one. Verify by visually inspecting the page at the top of scroll and after scrolling for any overlap.

## 4. Betting page: fold recommended picks into game cards

- [x] 4.1 In `src/app/betting/page.tsx`, remove `RecommendedPicksTable` and its `buildRecommendedPicks` call/usage from `BettingPage`. Verify the page still renders and no longer shows a standalone "Recommended picks" table.
- [x] 4.2 Confirm `GameCard`'s existing `BettableMark`/`ResultMark` marks (spread/total row and player-props grid) remain visible and sufficiently prominent on their own (e.g., add a subtle background tint on bettable cells/rows if a scan across cards doesn't surface picks as clearly as the removed table did). Verify by comparing, for a day with known bettable picks, that every pick previously listed in `RecommendedPicksTable` is still visibly marked somewhere in its `GameCard`.
- [x] 4.3 Remove now-unused code (`RecommendedPick` type, `buildRecommendedPicks`, `SegmentedToggle` usage inside the removed table if unused elsewhere) and verify the file still type-checks (`npx tsc --noEmit` or project's lint/build command) with no unused-symbol warnings introduced.

## 5. Cross-page verification

- [x] 5.1 Run the project's lint/build (e.g. `npm run build` or `npm run lint`) and verify it passes with no new errors from the changed files.
- [x] 5.2 Manually walk both pages in the browser: `/betting` (confirm game cards alone convey today's picks) and `/betting/research/[playerId]` for a player with multiple live props, a player with one live prop, and a player with none (`notFound` state), confirming each renders correctly end to end.
