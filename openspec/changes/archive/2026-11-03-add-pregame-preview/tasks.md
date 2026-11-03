# Tasks

## 1. Depth-chart-based projected lineups

- [x] 1.1 Add a helper that, given a `teamEspnId` (and season year), calls `getTeamDepthChart` and returns its top-five players labeled as projected starters, returning null if the depth chart can't be retrieved; verify with a unit test covering a successful lookup and a failed/missing depth chart
- [x] 1.2 Run the two teams' lookups in parallel and verify via a test/mock that both calls happen concurrently, not sequentially

## 2. Pregame preview article extraction

- [x] 2.1 Add `extractPreviewArticle` to `src/lib/espn-live.ts`, mirroring `extractRecap` but matching `article.type === "Preview"` instead of `"Recap"`; wire it into `GameSummaryExtras`/`LiveGameDetail` as a new `previewArticle` field; verify with a unit test using a fixture article of type "Preview" (headline/source/story present) and one of type "Recap" (expect null)

## 3. Preview data aggregation on the game API route

- [x] 3.1 In `src/app/api/games/[eventId]/route.ts`, when the resolved game status is scheduled, query `GameProjection` and odds for this `gameId`, deriving win% from `GameProjection`'s own margin/stdev (see Task 3.7) rather than `PredictorSnapshot` (same selection shape as `api/betting/upcoming/route.ts`) and attach the result under a `preview.projection` key; verify with a test that a scheduled game with a projection on record returns that data, and one without a projection returns `preview.projection` as absent/null rather than throwing
- [x] 3.2 In the same conditional branch, query `PlayerAvailability` for the game joined with `player.displayName` and team, grouped by team, and attach it under `preview.availability`; verify with a test that OUT/DOUBTFUL/QUESTIONABLE/PROBABLE players are included with their status and AVAILABLE-only rosters still return a (non-null, empty-of-concerns) result per the spec's empty-state scenario
- [x] 3.3 Attach the depth-chart-based lineups (from Task 1) under `preview.lineups.{home,away}`, each entry either the top-five array or null if unavailable; verify with a test covering both a successful lookup and a missing depth chart for one team
- [x] 3.4 Add a `preview.playerProps` list: query `PlayerPropProjection` (with `line != null`) joined to `PlayerPropOdds` (for the matching lean side) and `player.displayName` for this `gameId`, compute each player's over/under lean the same way `api/betting/upcoming/route.ts` does, and attach the result; verify with a test covering a player with a line/lean present and a game with no player props on record (empty list, not an error)
- [x] 3.5 Attach the pregame preview article (Task 2) under `preview.article`; verify with a test that it's populated when ESPN's article is type "Preview" and null otherwise
- [x] 3.6 Verify the route's existing in-progress/final paths are unaffected (re-confirmed): run existing route tests (or add one) confirming `preview` is omitted entirely when status is not scheduled
- [x] 3.7 Add `marginToWinPct(projectedMargin, marginStdev)` to `lib/projections/confidence.ts` (standard normal CDF, `null` for no/non-positive stdev) and use it in `getGamePreview` for `homeWinPct`/`awayWinPct` instead of `PredictorSnapshot` — found during manual verification against game 401909907 that the ESPN-predictor-based win% and the app's own score projection could visibly disagree in direction, since they're independent models captured at different times (`PredictorSnapshot` is frozen at capture, days stale by view time); verify with unit tests covering a dead-even margin (50%), a clear favorite each direction, symmetry between equal/opposite margins, and null stdev

## 4. Pregame tab set on the game detail page

- [x] 4.1 In `src/app/games/[eventId]/page.tsx`, add an `"odds"` entry to `TabKey`, and swap the rendered tab set to `[gamecast, preview, odds]` (Gamecast active by default) whenever the game is scheduled, replacing `[gamecast, recap, boxscore, playbyplay, teamstats]`; verify by loading a scheduled game's page and a final game's page and confirming the tab bars differ per the spec's two scenarios
- [x] 4.2 Build a pregame Gamecast dashboard (reusing the live Gamecast tab's 3-column `FullBleed` grid layout) that renders, for a scheduled game: a projection summary card (projected score, win probability, market line) reading from `preview.projection` with clean omission when absent; a starting lineups panel per team reading from `preview.lineups`, omitting a team's panel if its lineup is null, each column always labeled "Projected Starters"; an injury/availability panel per team reading from `preview.availability`, with flagged players grouped/highlighted and a "no concerns" message when a team's roster is all AVAILABLE; plus the existing `MatchupsCard`/`GameInformationCard` in place of the live-only cards (game leaders, this-game team stats, win-probability flow, shot chart) that have nothing to show pregame; verify by rendering a scheduled game with projection/lineup/availability data present and one missing projection data
- [x] 4.3 Build the Preview tab's article view reading from `preview.article`, reusing `RecapTab`'s rendering (headline/byline/body paragraphs) with its own "no preview available" empty-state message; verify by rendering a scheduled game with and without a preview article present
- [x] 4.4 Build the Odds tab: the market odds table (reusing the existing odds-table markup already shown on the live/final Box Score tab) plus a player prop leans list reading from `preview.playerProps` (player name, stat type, projected value, line, over/under lean), each section omitted independently when its data is absent; verify by rendering a scheduled game with both odds and props present, and one with neither

## 5. ESPN predictor shown separately

- [x] 5.1 Add `extractEspnPredictor(summary, homeEspnTeamId, awayEspnTeamId)` to `src/lib/espn-live.ts`, reading the already-fetched summary's `predictor.homeTeam`/`predictor.awayTeam` (matched by team id, each a win% string despite ESPN's `gameProjection` field name) into `{ homeWinPct, awayWinPct }`, `null` if the predictor or either match is missing; wire it into `LiveGameDetail` as `espnPredictor`; verify with unit tests covering a successful match, no predictor field, and a team id that doesn't match either entry
- [x] 5.2 Attach `liveGame.espnPredictor` under `preview.espnPredictor` in the API route (same pattern as `preview.article`); verify by requesting a scheduled game and confirming both `preview.projection` (our own) and `preview.espnPredictor` (ESPN's) are present and independently populated
- [x] 5.3 Add an `EspnPredictorCard` to the pregame Gamecast dashboard, rendered as its own container below `ProjectionSummaryCard` (not merged into it) reading from `preview.espnPredictor`, omitted when absent; verify by rendering a scheduled game with both cards present and confirming they show their own distinct numbers

## 6. Preview article blurb on the Gamecast tab

- [x] 6.1 Add `description` to `RecapArticle` (both `src/lib/espn-live.ts` and the frontend's duplicate type) and to the raw `EspnArticle` shape, populated from ESPN's `article.description` in both `extractRecap` and `extractPreviewArticle`; verify with unit tests covering a fixture with a description present and an article with none (expect `null`)
- [x] 6.2 Add a `PreviewBlurb` component rendering the preview article's headline, description, and byline (date · source), rendered at the top of the Gamecast dashboard's middle column above `ProjectionSummaryCard`/`EspnPredictorCard`, omitted when no preview article exists; verify by rendering a scheduled game with a preview article present and one without

## 7. End-to-end verification

- [x] 7.1 Load a real currently-scheduled game's detail page and confirm: Gamecast is active by default and shows the preview blurb, projection/lineups/availability/matchups/game-info per what ESPN/DB data actually exists for that game, with the ESPN Predictor card showing separately from the Projection card; the Preview tab shows the real ESPN preview article; the Odds tab shows odds and any player props on record; and the recap/box score/play-by-play/team stats tabs are not present
- [x] 7.2 Load a final (completed) game's detail page and confirm behavior is unchanged from before this change (gamecast/recap/box score/play-by-play/team stats tabs present and working, no pregame-only tabs)
