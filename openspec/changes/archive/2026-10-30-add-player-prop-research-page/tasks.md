# Tasks

## 1. Research API route

- [x] 1.1 Add `src/app/api/betting/research/[playerId]/route.ts` accepting a `stat` query param; derive the player's next scheduled game and today's `PlayerPropOdds` line/odds for that stat, and verify a request for a player/stat with a live line returns the line, the resolved game, and that stat's current odds.
- [x] 1.2 Implement per-stat value derivation from `PlayerGameStat` covering simple stats (points, rebounds, assists, 3PM, steals, blocks), combo stats (PTS+AST, PTS+REB, REB+AST, PRA as sums), and boolean stats (double-double, triple-double as threshold checks), reusing the same derivation logic the existing projection/confidence code uses; verify with a case for each `PropStatType`.
- [x] 1.3 Return the player's historical games for the selected stat (date, opponent team, home/away, derived value, over/under/push vs. today's line) ordered most-recent first; verify the response includes every `PlayerGameStat` row where the derived stat is available.
- [x] 1.4 Compute L5/L10/L20/season hit-rate summaries (count of games available, count over, count under, count push) and verify a case where fewer games exist than the window size reports the smaller sample size instead of erroring.
- [x] 1.5 Support `home`, `away`, and `opponent` filters (opponent resolved from today's scheduled game) recomputing the game list and hit-rate summaries, and verify a filter with zero matching games returns an explicit empty result rather than a malformed response.
- [x] 1.6 Include the linked `PlayerPropProjection` value (null if none exists yet) and the list of other `PropStatType`s this player has a live `PlayerPropOdds` line for today; verify both fields on a player with multiple tracked props.
- [x] 1.7 Return a distinguishable "not found" response when the requested player has no live `PlayerPropOdds` row for any stat today; verify with a player who has no scheduled game today.

## 2. Research page

- [x] 2.1 Add `src/app/betting/research/[playerId]/page.tsx` reading the `stat` query param, fetching the route from Task 1, and rendering the player name, selected stat, and today's line; verify the page loads for a player/stat combination known to have a live prop.
- [x] 2.2 Render the "no research available" state from the spec when the API returns the not-found response from task 1.7; verify by visiting the route for a player with no live prop today.
- [x] 2.3 Build the game-history chart (hand-rolled SVG, following the `GameFlowChart`/`ProbabilityChart` convention in `src/app/games/[eventId]/page.tsx`) with one mark per historical game colored by over/under/push against today's line, and the model projection value rendered distinctly from the market line when present; verify visually against a player with a mix of over/under games and against one with no projection yet.
- [x] 2.4 Add hit-rate chips for L5/L10/L20/season, showing the smaller-sample indicator from task 1.4 when applicable; verify against a player with a short game history.
- [x] 2.5 Add the All/Home/Away/vs-opponent filter control wired to task 1.5, including the explicit empty state when a filter yields no games; verify by selecting each filter against a player's data.
- [x] 2.6 Add the in-place stat-switch control for players with more than one live prop today, updating the chart/line/hit-rates without a full navigation; verify against a player with at least two tracked stats today.

## 3. Betting page integration

- [x] 3.1 Add a research link/icon on each player prop cell in `src/app/betting/page.tsx` pointing to `/betting/research/[playerId]?stat=<statType>`; verify clicking it from a live game card lands on the matching research page with that stat pre-selected.

## 4. Verification

- [x] 4.1 Walk through the full flow end to end against real data — open `/betting`, click a research link, confirm chart/hit-rates/filters/stat-switch all reflect that player's actual `PlayerGameStat` history, then verify a direct visit to a player/stat with no live prop shows the no-research state.
