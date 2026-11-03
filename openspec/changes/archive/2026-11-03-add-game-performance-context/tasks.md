# Tasks

## 1. API

- [x] 1.1 In `src/app/api/games/[eventId]/route.ts`'s FINAL-game branch, add `teamPerformances: { include: { tags: true } }` to the `prisma.game.findUnique` include, and include each team's cover margin, label, and tags (mapped by `teamId` to home/away) in the JSON response; verify by requesting a final game that has `TeamGamePerformance` rows and confirming both teams' data appears, and requesting a final game with none and confirming the field is absent/empty rather than erroring

## 2. UI

- [x] 2.1 Add a `GamePerformanceCard` (or similarly named) component that takes both teams' cover margin, label, and tags and renders them using the existing `AverageLabelPill`/`PerformanceLabelPill`/`TAG_TEXT`/`formatMargin`/`marginColorClass` helpers from `src/components/performance-display.tsx`; verify it renders correctly for a team that beat the spread, one that missed it, and one with several tags
- [x] 2.2 Render the card in `src/app/games/[eventId]/page.tsx`'s final-game Gamecast layout, in the right-hand column near `OddsPanel`, only when the API response includes performance data for the game; verify against a graded final game and against a final game with no recorded spread (card does not render, no broken layout)

## 3. Integration verification

- [x] 3.1 Verify the card's cover margin and label for a sample game match that same game's row on the team Performance tab (`src/components/TeamPerformanceTab.tsx`) for both teams
- [x] 3.2 Verify desktop and mobile layouts, and light and dark themes
- [x] 3.3 Run `npx tsc --noEmit`, the lint script, and the unit tests; fix any failures
- [x] 3.4 Run `openspec validate add-game-performance-context` and fix any reported issues
