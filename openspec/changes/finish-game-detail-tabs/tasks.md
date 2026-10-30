# Tasks

## 1. Recap extraction (`src/lib/espn-live.ts`)

- [x] 1.1 Add a `stripHtmlToParagraphs` (or similarly named) plain-text helper that strips tags from an HTML string and splits it into trimmed, non-empty paragraphs on blank lines; verify with a `node:test` unit test (same pattern as `src/lib/team-accent.test.ts`) covering: inline `<a href="...">text</a>` markup collapses to `text`, multiple blank-line-separated paragraphs split correctly, and leading/trailing whitespace is trimmed.
- [x] 1.2 Add a `RecapArticle` type and `extractRecap(summary)` function that reads the summary's `article` field, returns `null` unless `article.type === "Recap"`, and otherwise returns `{ headline, source, publishedAt, paragraphs }` (paragraphs via 1.1's helper on `article.story`); verify with a `node:test` unit test using `ingest/__fixtures__/summary.json` asserting a non-null result with the fixture's known headline, and a second case asserting `null` when `article.type` is not `"Recap"` or `article` is absent.
- [x] 1.3 Wire `extractRecap` into `getGameSummaryExtras`, adding `recap: RecapArticle | null` to the `GameSummaryExtras` return shape; verify by confirming the existing `getGameSummaryExtras` call sites (both branches of `GET /api/games/[eventId]`) compile against the extended shape with no other changes needed (TypeScript build passes).

## 2. Team stats breakdown extraction (`src/lib/espn-live.ts`)

- [x] 2.1 Add a `TeamStatCategory` type (`{ name, label, awayDisplay, homeDisplay }`) and `extractTeamStatsBreakdown(summary, awayEspnTeamId, homeEspnTeamId)` function that zips each team's `boxscore.teams[].statistics[]` entries by `name` across the two teams (not by array index, per design.md's zip-by-name decision) into one row per category, using the away/home team ids to pick each side; verify with a `node:test` unit test using `ingest/__fixtures__/summary.json` asserting the known category count (23) and that a couple of known categories (e.g. `fieldGoalPct`, `largestLead`) resolve to the correct label and display values for each side.
- [x] 2.2 Handle the case where `boxscore.teams` is empty or missing (scheduled/very-early game) by returning `null` rather than an empty-but-present array that a caller might render as "zero stats"; verify with a `node:test` unit test asserting `null` for an empty/missing `boxscore.teams` input.
- [x] 2.3 Wire `extractTeamStatsBreakdown` into `getGameSummaryExtras`, adding `teamStatsBreakdown: TeamStatCategory[] | null` to the `GameSummaryExtras` return shape; verify by confirming both branches of `GET /api/games/[eventId]` (DB-backed and live-proxied) compile and that a manual request to `/api/games/[eventId]` for a finished game (e.g. the one used during exploration, `401909893`) includes a populated `teamStatsBreakdown` in the JSON response.

## 3. Recap tab (`src/app/games/[eventId]/page.tsx`)

- [x] 3.1 Extend the page's local types (`HeaderExtras`-adjacent extras handling) to carry `recap: RecapArticle | null` from the API response.
- [x] 3.2 Build the Recap tab view: headline, byline (source + formatted published date, reusing `formatGameDateTime`-style formatting), and body paragraphs rendered as plain `<p>` elements — no `dangerouslySetInnerHTML` anywhere in this component, per design.md's HTML-stripping decision.
- [x] 3.3 Replace the `{activeTab === "recap" && <p>...Coming soon...</p>}` block with the new view, falling back to a "No recap available for this game." message (matching the existing empty-state voice used by `OddsPanel`) when `recap` is `null`.
- [x] 3.4 Verify in the browser: load `/games/401909893?tab=recap` (a finished game) and confirm the headline/byline/body render as plain text with no stray markup; then load a scheduled/future game's detail page on the `recap` tab and confirm the empty-state message renders instead of a blank or broken view.

## 4. Team Stats tab (`src/app/games/[eventId]/page.tsx`)

- [x] 4.1 Extend the page's local types to carry `teamStatsBreakdown: TeamStatCategory[] | null` from the API response.
- [x] 4.2 Build the Team Stats tab view: a two-column away/home comparison table (reusing the Box Score tab's existing `<table>` styling) with one row per category, labeled by each category's own `label`.
- [x] 4.3 Replace the `{activeTab === "teamstats" && <p>...Coming soon...</p>}` block with the new table, falling back to a "Team stats are not yet available for this game." message when `teamStatsBreakdown` is `null`.
- [x] 4.4 Verify in the browser: load `/games/401909893?tab=teamstats` (a finished game) and confirm all 23 categories render correctly for both teams; then load a scheduled game's detail page on the `teamstats` tab and confirm the empty-state message renders instead.

## 5. Integration check

- [x] 5.1 Run `npm run lint` and the project's TypeScript check and confirm both pass with no new errors across `src/lib/espn-live.ts` and `src/app/games/[eventId]/page.tsx`.
- [x] 5.2 Click through all five tabs (Gamecast, Recap, Box Score, Play-by-Play, Team Stats) on `/games/401909893` in the browser and confirm no regressions to the three already-complete tabs.
