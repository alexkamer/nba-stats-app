# Proposal

## Why

The app already tracks every team/player stat and game-level betting line needed to form an opinion on upcoming games, but today that data is only used retrospectively (grading a line after the fact on the game and team pages). Bettors want a forward-looking view: who to bet on, which player props to take, and whether the numbers actually support the market line, before the game tips off.

## What Changes

- Ingest richer, forward-looking market odds for scheduled games from ESPN's free core API: game-level lines with open/current line movement (beyond the single snapshot the existing `Odds` model stores), plus player prop lines (points/rebounds/assists/3PM/steals/blocks/combos/double-double, etc.) that have no existing equivalent in this app.
- Snapshot ESPN's own pre-game `predictor` projection for each upcoming game (not persisted anywhere today, including by ESPN itself, since it disappears once a game goes final).
- Build an in-house projection model, derived from existing team/player season and game-log stats, that produces a game-level pick (spread/total/moneyline lean) and player-prop picks (over/under lean per tracked stat), each compared against the market line to surface an edge.
- Track prediction accuracy over time: once a game finishes, grade our own projection and ESPN's snapshotted predictor against the actual result, and accumulate a running, visible accuracy record for both (and the market) so ESPN's predictor can be judged on real results rather than assumed trustworthy.
- Add a new "Bettor's Heaven" page presenting today's/upcoming games with our pick, the market line, ESPN's predictor, and top player prop leans, plus the accuracy scoreboard.
- Add the page to the top nav.

## Capabilities

### New Capabilities
- `betting-odds-ingest`: Fetching and persisting market game odds (with line movement) and player prop odds for scheduled games from ESPN's core API, plus snapshotting ESPN's pre-game predictor projection.
- `betting-projections`: Generating our own game-level and player-prop projections from existing team/player stats, and comparing them against market lines to produce picks/edges.
- `prediction-accuracy-tracking`: Grading snapshotted projections (ours and ESPN's) against final game results and maintaining a running accuracy record.
- `betting-insights-page`: The user-facing page surfacing picks, player props, market/ESPN reference numbers, and the accuracy scoreboard, linked from the top nav.

### Modified Capabilities
(none — existing retrospective odds display on the game/team pages is unaffected; this change only adds new, separate capabilities)

## Impact

- **Schema** (`prisma/schema.prisma`): new tables for scheduled-game market odds with line movement, player prop lines, ESPN predictor snapshots, our own projections, and graded accuracy records. Existing `Odds`/`Game` models are read, not modified.
- **Ingest** (`ingest/`): new fetch/mapper logic for the core API's odds/propBets/predictor endpoints, likely a new scheduled job given these need to run close to game time and be re-fetched as lines move.
- **New projection logic**: a new module computing team/player projections from `TeamSeasonStat`, `PlayerSeasonStat`, `TeamGameStat`, `PlayerGameStat`, recent-form, and home/away splits.
- **New API routes** under `src/app/api/` to serve the page's data.
- **New page** `src/app/betting/` (or similar) plus a nav link in `src/app/layout.tsx`.
